import datetime
import hashlib
import io
import json
import logging
import os
import re
from typing import Any

import requests
from fastapi import HTTPException
from pypdf import PdfReader

from app.database import supabase
from app.models.uploads import UploadProcessBody
from app.observability import capture_backend_exception, init_sentry, log_structured_event
from app.routes.uploads import (
    FREE_PLAN_MAX_PDF_PAGES,
    USER_SAFE_UPLOAD_ERRORS,
    clean_and_trim_text,
    create_generation_job,
    estimate_tokens,
    get_today_upload_usage,
    get_unique_valid_cards,
    log_ai_generation,
    notify_upload_processing_result,
    normalize_question,
    record_processing_event,
    record_provider_health,
    sanitize_db_text,
    update_generation_job,
    update_upload_job,
)
from app.routes.youtube import USER_SAFE_YOUTUBE_ERRORS, update_youtube_generation
from app.services.ai_orchestrator import (
    AIProviderRateLimitError,
    AIProviderResult,
    choose_alternate_provider,
    choose_round_robin_provider,
    generate_flashcards_with_provider,
    generate_summary_with_provider,
    get_available_providers,
)
from app.services.deck_titles import generate_study_deck_title
from app.services.srs import create_initial_review_state
from app.services.ai_usage_quota import consume_ai_generation_quota
from app.services.entitlements import get_user_plan, has_pro_access
from app.services.youtube_transcripts import YouTubeTranscriptError, fetch_transcript, normalize_transcript
from app.runtime_config import load_runtime_config


load_runtime_config()
init_sentry()

logger = logging.getLogger("pikadecks.pipeline_workers")


def _worker_failure_payload(exc: Exception) -> tuple[str, str]:
    if isinstance(exc, HTTPException):
        detail = str(exc.detail)
        lower_detail = detail.lower()
        if exc.status_code == 429 or "rate limit" in lower_detail or "too many request" in lower_detail:
            return "LLM_RATE_LIMIT", USER_SAFE_UPLOAD_ERRORS["LLM_RATE_LIMIT"]
        if exc.status_code == 400 and "extract" in lower_detail:
            return "PDF_EXTRACTION_FAILED", USER_SAFE_UPLOAD_ERRORS["PDF_EXTRACTION_FAILED"]
        if exc.status_code == 400 and "content" in lower_detail:
            return "INSUFFICIENT_TEXT", USER_SAFE_UPLOAD_ERRORS["INSUFFICIENT_TEXT"]
    if isinstance(exc, AIProviderRateLimitError):
        return "LLM_RATE_LIMIT", USER_SAFE_UPLOAD_ERRORS["LLM_RATE_LIMIT"]
    message = str(exc).lower()
    if "rate limit" in message or "too many request" in message or "429" in message:
        return "LLM_RATE_LIMIT", USER_SAFE_UPLOAD_ERRORS["LLM_RATE_LIMIT"]
    if "no valid" in message or "not enough valid" in message:
        return "NO_VALID_CARDS", USER_SAFE_UPLOAD_ERRORS["NO_VALID_CARDS"]
    if "database" in message or "supabase" in message:
        return "DATABASE_FAILED", USER_SAFE_UPLOAD_ERRORS["DATABASE_FAILED"]
    return "WORKER_FAILED", USER_SAFE_UPLOAD_ERRORS["WORKER_FAILED"]


MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024
CHUNK_CHAR_LIMIT = 6000
MIN_SECTION_CHARS = 1200
SUMMARY_GROUP_TOKEN_LIMIT = int(os.getenv("SUMMARY_GROUP_TOKEN_LIMIT", "3500"))
SUMMARY_GROUP_MAX_CHUNKS = int(os.getenv("SUMMARY_GROUP_MAX_CHUNKS", "2"))
MAX_CARDS_PER_CHUNK = int(os.getenv("MAX_CARDS_PER_CHUNK", "12"))
MIN_CARD_QUALITY_SCORE = float(os.getenv("MIN_CARD_QUALITY_SCORE", "0.35"))
MIN_FINAL_CARDS_REQUIRED = int(os.getenv("MIN_FINAL_CARDS_REQUIRED", "1"))
CARD_OVERGENERATION_BUFFER = int(os.getenv("CARD_OVERGENERATION_BUFFER", "3"))
REDUCER_TOPUP_ATTEMPTS = int(os.getenv("REDUCER_TOPUP_ATTEMPTS", "3"))
REDUCER_REQUEUE_ATTEMPTS = int(os.getenv("REDUCER_REQUEUE_ATTEMPTS", "3"))
PROVIDER_CHAIN_DELAY_SECONDS = int(os.getenv("PROVIDER_CHAIN_DELAY_SECONDS", "2"))
PROVIDER_RATE_LIMIT_COOLDOWN_SECONDS = int(os.getenv("PROVIDER_RATE_LIMIT_COOLDOWN_SECONDS", "60"))
YOUTUBE_CHUNK_CHAR_LIMIT = int(os.getenv("YOUTUBE_CHUNK_CHAR_LIMIT", "12000"))
YOUTUBE_SUMMARY_GROUP_TOKEN_LIMIT = int(os.getenv("YOUTUBE_SUMMARY_GROUP_TOKEN_LIMIT", "3500"))
YOUTUBE_SUMMARY_GROUP_MAX_CHUNKS = int(os.getenv("YOUTUBE_SUMMARY_GROUP_MAX_CHUNKS", "1"))


def _queue_url(name: str) -> str | None:
    return os.getenv(name)


def _utcnow_iso() -> str:
    return datetime.datetime.utcnow().isoformat()


def _log_provider_call(generation_id: str | None, provider: str, call_type: str) -> None:
    logger.info("Generation %s calling provider=%s call_type=%s", generation_id, provider, call_type)


def _refresh_pdf_llm_call_metrics(upload_id: str, job_id: str | None) -> dict[str, Any]:
    if not job_id:
        return {"summary_calls": 0, "card_calls": 0, "total_llm_calls": 0, "total_chunks": 0}

    try:
        chunk_rows = supabase.table("generation_chunks").select("chunk_id").eq("upload_id", upload_id).execute().data or []
        summary_rows = supabase.table("chunk_summaries").select("summary_id,provider_name").eq("upload_id", upload_id).execute().data or []
        card_call_rows = (
            supabase.table("processing_events")
            .select("event_id,provider_name")
            .eq("job_id", job_id)
            .eq("stage", "GENERATING_CARDS")
            .eq("code", "LLM_CARD_CALL")
            .execute()
            .data
            or []
        )
        summary_calls = len(summary_rows)
        card_calls = len(card_call_rows)
        total_llm_calls = summary_calls + card_calls
        provider_call_breakdown: dict[str, int] = {}
        for row in [*summary_rows, *card_call_rows]:
            provider_name = row.get("provider_name") or "unknown"
            provider_call_breakdown[provider_name] = provider_call_breakdown.get(provider_name, 0) + 1
        update_generation_job(
            job_id,
            total_chunks=len(chunk_rows),
            summary_calls=summary_calls,
            card_calls=card_calls,
            total_llm_calls=total_llm_calls,
            provider_call_breakdown=provider_call_breakdown,
        )
        return {
            "summary_calls": summary_calls,
            "card_calls": card_calls,
            "total_llm_calls": total_llm_calls,
            "total_chunks": len(chunk_rows),
            "provider_call_breakdown": provider_call_breakdown,
        }
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="ai_generation",
            action="refresh_pdf_llm_call_metrics_failed",
            tags={"upload_id": upload_id, "job_id": job_id},
        )
        return {"summary_calls": 0, "card_calls": 0, "total_llm_calls": 0, "total_chunks": 0}


def _aws_region() -> str:
    return os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "ap-south-1"


def _send_message(queue_env_name: str, payload: dict[str, Any], delay_seconds: int = 0) -> None:
    import boto3

    queue_url = _queue_url(queue_env_name)
    if not queue_url:
        raise RuntimeError(f"{queue_env_name} is not configured")

    boto3.client("sqs", region_name=_aws_region()).send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(payload),
        DelaySeconds=max(0, min(900, delay_seconds)),
    )


def _provider_queue_env(provider_name: str) -> str:
    if provider_name == "gemini":
        return "GEMINI_GENERATION_QUEUE_URL"
    if provider_name == "groq":
        # TODO: Restore Groq SQS pipeline once the infrastructure resources are re-enabled.
        return "GROQ_GENERATION_QUEUE_URL"
    raise RuntimeError(f"Unknown provider queue: {provider_name}")


def _is_upload_cancelled(upload_id: str) -> bool:
    rows = (
        supabase.table("uploads")
        .select("processing_status,processing_stage")
        .eq("upload_id", upload_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return False
    upload = rows[0]
    return upload.get("processing_status") == "cancelled" or upload.get("processing_stage") == "CANCELLED"


def _routeable_providers() -> list[str]:
    available = get_available_providers()
    if not available:
        return []
    if "groq" in available:
        return available
    try:
        now = datetime.datetime.utcnow()
        health_rows = supabase.table("provider_health").select("provider_name,status,cooldown_until").in_("provider_name", available).execute().data or []
        blocked: set[str] = set()
        for row in health_rows:
            cooldown_until = row.get("cooldown_until")
            in_cooldown = False
            if cooldown_until:
                try:
                    in_cooldown = datetime.datetime.fromisoformat(cooldown_until.replace("Z", "+00:00")).replace(tzinfo=None) > now
                except ValueError:
                    in_cooldown = False
            if row.get("status") == "OPEN" and in_cooldown:
                blocked.add(row["provider_name"])
        routeable = [provider for provider in available if provider not in blocked]
        return routeable or available
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="ai_generation",
            action="provider_health_route_read_failed",
            tags={"component": "ai_orchestrator"},
        )
        return available


def _download_pdf(file_url: str) -> bytes:
    is_s3_url = "amazonaws.com" in file_url
    aws_bucket = os.getenv("AWS_BUCKET_NAME") or os.getenv("S3_BUCKET")
    aws_region = os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "us-east-1"

    if is_s3_url and aws_bucket:
        try:
            import boto3

            path = file_url.split("amazonaws.com/")[-1]
            s3_client = boto3.client("s3", region_name=aws_region)
            return s3_client.get_object(Bucket=aws_bucket, Key=path)["Body"].read()
        except Exception as exc:
            capture_backend_exception(
                exc,
                feature="upload",
                action="pipeline_s3_download_failed",
                tags={"component": "s3"},
                extra={"bucket": aws_bucket, "region": aws_region, "file_url": file_url},
            )

    response = requests.get(file_url, timeout=30)
    if not response.ok:
        raise HTTPException(status_code=400, detail="Failed to fetch PDF from storage.")
    return response.content


def _clean_page_for_chunking(text: str) -> str:
    if not text:
        return ""

    skip_keywords = [
        "all rights reserved",
        "copyright",
        "isbn ",
        "bibliography",
        "references",
        "index",
    ]
    lines: list[str] = []
    for line in sanitize_db_text(text).splitlines():
        stripped = re.sub(r"\s+", " ", line).strip()
        if not stripped:
            continue
        lower = stripped.lower()
        if any(keyword in lower for keyword in skip_keywords):
            continue
        lines.append(stripped)
    return "\n".join(lines)


def _extract_and_upload_page_images(reader: PdfReader, page_num: int, user_id: str) -> list[str]:
    image_keys = []
    try:
        page = reader.pages[page_num]
        aws_bucket = os.getenv("AWS_BUCKET_NAME") or os.getenv("S3_BUCKET")
        aws_region = os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "us-east-1"
        aws_access_key = os.getenv("PIKA_AWS_ACCESS_KEY_ID")
        aws_secret_key = os.getenv("PIKA_AWS_SECRET_ACCESS_KEY")
        
        if not aws_bucket:
            return []
            
        import boto3
        from botocore.config import Config
        s3_client_kwargs = {
            "region_name": aws_region,
            "config": Config(signature_version="s3v4"),
        }
        if aws_access_key and aws_secret_key:
            s3_client_kwargs["aws_access_key_id"] = aws_access_key
            s3_client_kwargs["aws_secret_access_key"] = aws_secret_key
            
        s3_client = boto3.client("s3", **s3_client_kwargs)
        
        # Check if the page has images and extract them
        if hasattr(page, "images"):
            for img_idx, image_file_object in enumerate(page.images):
                timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
                img_name = getattr(image_file_object, "name", f"img_{img_idx}.png")
                unique_name = f"{timestamp}_{page_num}_{img_idx}_{img_name}"
                key = f"images/{user_id}/{unique_name}"
                
                s3_client.put_object(
                    Bucket=aws_bucket,
                    Key=key,
                    Body=image_file_object.data,
                    ContentType="image/png"
                )
                image_keys.append(key)
    except Exception as exc:
        logger.warning("Error extracting/uploading images for page %s: %s", page_num, exc)
    return image_keys


def _extract_pages(pdf_content: bytes, user_id: str) -> tuple[int, list[str]]:
    reader = PdfReader(io.BytesIO(pdf_content))
    pages: list[str] = []
    for page_num, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        cleaned_page = _clean_page_for_chunking(text)
        
        img_keys = _extract_and_upload_page_images(reader, page_num, user_id)
        if img_keys:
            img_refs = "\n\n" + "\n".join(f"[Image Reference: {key}]" for key in img_keys)
            cleaned_page += img_refs
            
        if cleaned_page.strip():
            pages.append(cleaned_page)
    return len(reader.pages), pages


def _looks_like_heading(line: str) -> bool:
    stripped = line.strip()
    if len(stripped) < 4 or len(stripped) > 120:
        return False
    if stripped.endswith((".", ",", ";", ":")) and not re.match(r"^\d+(\.\d+)*\s+", stripped):
        return False
    if re.match(r"^(chapter|unit|module|section|lesson|part)\s+[\w\d]+", stripped, re.IGNORECASE):
        return True
    if re.match(r"^\d+(\.\d+)*\s+[A-Z][A-Za-z0-9 ,()/-]+$", stripped):
        return True
    words = stripped.split()
    if 1 <= len(words) <= 9:
        alpha = [word for word in words if any(char.isalpha() for char in word)]
        if alpha and sum(word[:1].isupper() for word in alpha) / len(alpha) >= 0.65:
            return True
    return False


def _split_oversized_section(section: dict[str, Any], chunk_char_limit: int) -> list[dict[str, Any]]:
    text = section["text"]
    if len(text) <= chunk_char_limit:
        return [section]

    chunks: list[dict[str, Any]] = []
    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n{2,}", text) if paragraph.strip()]
    current: list[str] = []
    current_len = 0
    for paragraph in paragraphs or [text]:
        if len(paragraph) > chunk_char_limit:
            for start in range(0, len(paragraph), chunk_char_limit):
                segment = paragraph[start:start + chunk_char_limit].strip()
                if segment:
                    chunks.append({**section, "text": segment})
            current = []
            current_len = 0
            continue
        if current and current_len + len(paragraph) > chunk_char_limit:
            chunks.append({**section, "text": "\n\n".join(current)})
            current = [paragraph]
            current_len = len(paragraph)
        else:
            current.append(paragraph)
            current_len += len(paragraph) + 2
    if current:
        chunks.append({**section, "text": "\n\n".join(current)})
    return chunks


def _chunk_pages(pages: list[str], chunk_char_limit: int = CHUNK_CHAR_LIMIT) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    current_lines: list[str] = []
    current_heading = "Introduction"
    current_page_start = 1
    current_page_end = 1

    def flush_section() -> None:
        nonlocal current_lines
        text = "\n".join(current_lines).strip()
        if text:
            sections.append({
                "heading": current_heading,
                "page_start": current_page_start,
                "page_end": current_page_end,
                "text": text,
            })
        current_lines = []

    for page_offset, page_text in enumerate(pages):
        page_number = page_offset + 1
        for line in page_text.splitlines():
            if _looks_like_heading(line) and current_lines:
                flush_section()
                current_heading = line.strip()
                current_page_start = page_number
            else:
                if not current_lines:
                    current_page_start = page_number
                current_lines.append(line)
            current_page_end = page_number
    flush_section()

    merged_sections: list[dict[str, Any]] = []
    for section in sections:
        if (
            merged_sections
            and len(section["text"]) < MIN_SECTION_CHARS
            and len(merged_sections[-1]["text"]) + len(section["text"]) <= chunk_char_limit
        ):
            merged_sections[-1]["text"] = f"{merged_sections[-1]['text']}\n\n{section['heading']}\n{section['text']}"
            merged_sections[-1]["page_end"] = section["page_end"]
            continue
        merged_sections.append(section)

    chunks: list[dict[str, Any]] = []
    for section in merged_sections:
        for split_section in _split_oversized_section(section, chunk_char_limit):
            text = split_section["text"]
            heading = split_section.get("heading") or f"Pages {split_section['page_start']}-{split_section['page_end']}"
            chunks.append({
                "chunk_index": len(chunks),
                "page_start": split_section["page_start"],
                "page_end": split_section["page_end"],
                "heading": heading,
                "text": f"{heading}\n\n{text}",
            })

    if not chunks and pages:
        text = "\n\n".join(pages)
        chunks.append({
            "chunk_index": 0,
            "page_start": 1,
            "page_end": len(pages),
            "heading": "Document",
            "text": text,
        })
    return chunks


def _insert_chunks(upload_id: str, job_id: str | None, chunks: list[dict[str, Any]], *, plan: str = "free") -> list[dict[str, Any]]:
    providers = _routeable_providers()
    rows = []
    queued_provider_counts: dict[str, int] = {}
    max_queued_per_provider = int(os.getenv("PRO_INITIAL_CHUNKS_PER_PROVIDER", "2")) if plan == "pro" else 1

    grouped_chunks: list[dict[str, Any]] = []
    current_group: list[dict[str, Any]] = []
    current_tokens = 0

    def flush_group() -> None:
        nonlocal current_group, current_tokens
        if not current_group:
            return
        text_parts = []
        for source_chunk in current_group:
            text_parts.append(
                f"[Source chunk {source_chunk['chunk_index'] + 1}"
                f", pages {source_chunk.get('page_start')}-{source_chunk.get('page_end')}]\n"
                f"{source_chunk['text']}"
            )
        grouped_chunks.append({
            "chunk_index": len(grouped_chunks),
            "page_start": current_group[0].get("page_start"),
            "page_end": current_group[-1].get("page_end"),
            "heading": (
                current_group[0].get("heading")
                if len(current_group) == 1
                else f"{current_group[0].get('heading') or 'Section'} to {current_group[-1].get('heading') or 'Section'}"
            ),
            "text": "\n\n".join(text_parts),
            "source_chunk_count": len(current_group),
            "source_chunk_indexes": [chunk["chunk_index"] for chunk in current_group],
        })
        current_group = []
        current_tokens = 0

    for chunk in chunks:
        chunk_tokens = estimate_tokens(chunk["text"])
        group_full = (
            current_group
            and (
                len(current_group) >= SUMMARY_GROUP_MAX_CHUNKS
                or current_tokens + chunk_tokens > SUMMARY_GROUP_TOKEN_LIMIT
            )
        )
        if group_full:
            flush_group()
        current_group.append(chunk)
        current_tokens += chunk_tokens
    flush_group()

    for chunk in grouped_chunks:
        text = sanitize_db_text(chunk["text"])
        provider = choose_round_robin_provider(chunk["chunk_index"], providers)
        queued_count = queued_provider_counts.get(provider, 0)
        status = "queued" if queued_count < max_queued_per_provider else "waiting"
        if status == "queued":
            queued_provider_counts[provider] = queued_count + 1
        rows.append({
            "job_id": job_id,
            "upload_id": upload_id,
            "chunk_index": chunk["chunk_index"],
            "page_start": chunk["page_start"],
            "page_end": chunk["page_end"],
            "heading": sanitize_db_text(chunk.get("heading")),
            "text_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "chunk_text": text,
            "text_preview": text[:600],
            "token_estimate": estimate_tokens(text),
            "assigned_provider": provider,
            "status": status,
        })

    response = supabase.table("generation_chunks").upsert(rows, on_conflict="upload_id,chunk_index").execute()
    log_structured_event(
        "generation.chunk_grouping",
        source="pdf",
        upload_id=upload_id,
        job_id=job_id,
        source_chunks=len(chunks),
        provider_calls_planned=len(rows),
        plan=plan,
        initial_chunks_per_provider=max_queued_per_provider,
        group_token_limit=SUMMARY_GROUP_TOKEN_LIMIT,
        group_max_chunks=SUMMARY_GROUP_MAX_CHUNKS,
    )
    return response.data or []


def _enqueue_chunks(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        if _is_upload_cancelled(row["upload_id"]):
            return
        if row.get("status") != "queued":
            continue
        provider = row["assigned_provider"]
        _send_message(
            _provider_queue_env(provider),
            {
                "chunk_id": row["chunk_id"],
                "upload_id": row["upload_id"],
                "job_id": row.get("job_id"),
                "provider_name": provider,
            },
        )


def _enqueue_next_waiting_chunk(
    *,
    upload_id: str,
    job_id: str | None,
    provider_name: str,
    delay_seconds: int = PROVIDER_CHAIN_DELAY_SECONDS,
) -> None:
    if _is_upload_cancelled(upload_id):
        return

    waiting_rows = (
        supabase.table("generation_chunks")
        .select("chunk_id,upload_id,job_id,assigned_provider,chunk_index,status")
        .eq("upload_id", upload_id)
        .eq("assigned_provider", provider_name)
        .eq("status", "waiting")
        .order("chunk_index")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not waiting_rows:
        return

    row = waiting_rows[0]
    _mark_chunk(row["chunk_id"], {"status": "queued"})
    _send_message(
        _provider_queue_env(provider_name),
        {
            "chunk_id": row["chunk_id"],
            "upload_id": upload_id,
            "job_id": row.get("job_id") or job_id,
            "provider_name": provider_name,
        },
        delay_seconds=delay_seconds,
    )


def process_upload_to_chunks(message: dict[str, Any]) -> None:
    upload_id = message["upload_id"]
    user_id = message["user_id"]
    plan = message.get("plan") or get_user_plan(user_id)
    body = UploadProcessBody(
        file_url=message["file_url"],
        file_name=message.get("file_name"),
        file_type=message.get("file_type"),
        num_cards=message.get("num_cards") or 10,
    )

    max_cards = max(5, min(body.num_cards or 10, 30))
    if _is_upload_cancelled(upload_id):
        return
    update_upload_job(upload_id, status="processing", stage="VALIDATING", progress=5)
    pdf_content = _download_pdf(body.file_url)
    if len(pdf_content) > MAX_PDF_SIZE_BYTES:
        update_upload_job(
            upload_id,
            status="failed",
            stage="FAILED",
            progress=100,
            error_code="PDF_TOO_LARGE",
            error_message=USER_SAFE_UPLOAD_ERRORS["PDF_TOO_LARGE"],
        )
        raise HTTPException(status_code=400, detail=USER_SAFE_UPLOAD_ERRORS["PDF_TOO_LARGE"])

    update_upload_job(upload_id, stage="EXTRACTING", progress=15)
    page_count, pages = _extract_pages(pdf_content, user_id)
    supabase.table("uploads").update({
        "page_count": page_count,
        "plan_at_upload": plan,
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }).eq("upload_id", upload_id).execute()

    plan = get_user_plan(user_id)
    supabase.table("uploads").update({
        "plan_at_upload": plan,
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }).eq("upload_id", upload_id).execute()
    job_id = create_generation_job(
        upload_id=upload_id,
        user_id=user_id,
        requested_cards=max_cards,
        page_count=page_count,
        plan=plan,
    )

    if page_count > FREE_PLAN_MAX_PDF_PAGES and not has_pro_access(user_id):
        message_text = (
            f"Large PDF Detected. This document contains {page_count} pages. "
            "Free plan supports PDFs up to 150 pages. Upgrade to Premium to generate "
            "flashcards from larger documents with advanced AI processing."
        )
        update_upload_job(
            upload_id,
            status="failed",
            stage="FAILED",
            progress=100,
            error_code="PREMIUM_REQUIRED",
            error_message=message_text,
        )
        update_generation_job(
            job_id,
            status="failed",
            stage="FAILED",
            progress=100,
            error_code="PREMIUM_REQUIRED",
            error_message=message_text,
        )
        notify_upload_processing_result(user_id, upload_id, status="failed", error_message=message_text)
        return

    extracted_text = "\n\n".join(pages)
    if len(extracted_text.strip()) < 10:
        error_code = "OCR_FAILED" if page_count > 0 else "INSUFFICIENT_TEXT"
        error_message = (
            "Unable to extract readable text from the document. Scanned PDFs need OCR processing."
            if error_code == "OCR_FAILED"
            else USER_SAFE_UPLOAD_ERRORS["INSUFFICIENT_TEXT"]
        )
        record_processing_event(
            upload_id=upload_id,
            stage="EXTRACTING",
            level="error",
            code=error_code,
            message=error_message,
            metadata={"page_count": page_count, "extracted_page_count": len(pages)},
        )
        update_upload_job(
            upload_id,
            status="failed",
            stage="FAILED",
            progress=100,
            error_code=error_code,
            error_message=error_message,
            extracted_text=extracted_text[:1800],
        )
        update_generation_job(
            job_id,
            status="failed",
            stage="FAILED",
            progress=100,
            error_code=error_code,
            error_message=error_message,
        )
        notify_upload_processing_result(user_id, upload_id, status="failed", error_message=error_message)
        return

    update_upload_job(upload_id, stage="CHUNKING", progress=30, extracted_text=extracted_text[:1800])
    if _is_upload_cancelled(upload_id):
        return
    chunks = _chunk_pages(pages)
    chunk_rows = _insert_chunks(upload_id, job_id, chunks, plan=plan)
    update_generation_job(job_id, stage="GENERATING_CARDS", progress=35, total_chunks=len(chunk_rows))
    record_processing_event(
        upload_id=upload_id,
        stage="GENERATING_CARDS",
        message="Queued chunks for provider workers",
        metadata={
            "chunk_count": len(chunk_rows),
            "providers": _routeable_providers(),
            "plan": plan,
        },
    )
    _enqueue_chunks(chunk_rows)


def _load_chunk(chunk_id: str) -> dict[str, Any]:
    response = supabase.table("generation_chunks").select("*").eq("chunk_id", chunk_id).limit(1).execute()
    if not response.data:
        raise RuntimeError(f"Chunk not found: {chunk_id}")
    return response.data[0]


def _mark_chunk(chunk_id: str, payload: dict[str, Any]) -> None:
    payload["updated_at"] = datetime.datetime.utcnow().isoformat()
    supabase.table("generation_chunks").update(payload).eq("chunk_id", chunk_id).execute()


def _token_set(text: str | None) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(token) > 2
    }


def _similarity(left: str | None, right: str | None) -> float:
    left_tokens = _token_set(left)
    right_tokens = _token_set(right)
    if not left_tokens or not right_tokens:
        return 0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _score_card(card: dict[str, Any]) -> float:
    question = (card.get("question") or "").strip()
    answer = (card.get("answer") or "").strip()
    explanation = (card.get("explanation") or "").strip()
    if len(question) < 12 or len(answer) < 12:
        return 0
    if question.lower() == answer.lower():
        return 0

    score = 0.45
    question_words = len(question.split())
    answer_words = len(answer.split())
    if 5 <= question_words <= 28:
        score += 0.15
    if 8 <= answer_words <= 80:
        score += 0.2
    if explanation and len(explanation.split()) >= 6:
        score += 0.1
    if any(marker in question.lower() for marker in ["what", "why", "how", "define", "explain", "compare", "when", "where"]):
        score += 0.05
    vague_terms = ["this", "it", "they", "thing", "stuff", "above", "following"]
    if question_words <= 8 and any(term in question.lower().split() for term in vague_terms):
        score -= 0.2
    if _similarity(question, answer) > 0.85:
        score -= 0.25
    return max(0, min(1, score))


def _rank_cards(cards: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for card in cards:
        question = (card.get("question") or "").strip()
        answer = (card.get("answer") or "").strip()
        if not question or not answer:
            continue
        quality_score = float(card.get("quality_score") or _score_card(card))
        if quality_score < MIN_CARD_QUALITY_SCORE:
            continue
        normalized_question = normalize_question(question)
        if any(
            normalized_question == normalize_question(existing.get("question"))
            or _similarity(question, existing.get("question")) >= 0.78
            for existing in ranked
        ):
            continue
        ranked.append({
            **card,
            "question": question,
            "answer": answer,
            "explanation": (card.get("explanation") or "").strip() or None,
            "quality_score": quality_score,
        })

    ranked.sort(
        key=lambda card: (
            float(card.get("quality_score") or 0),
            len(card.get("answer") or ""),
            len(card.get("question") or ""),
        ),
        reverse=True,
    )
    return ranked[:limit]


def _generation_settings_hash(source: str, requested_cards: int) -> str:
    return hashlib.sha256(f"{source}:{requested_cards}:v2-summary-first".encode("utf-8")).hexdigest()


def _split_text_for_generation(text: str, char_limit: int) -> list[str]:
    normalized = normalize_transcript(text)
    paragraphs = [part.strip() for part in re.split(r"(?<=[.!?])\s+", normalized) if part.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for paragraph in paragraphs or [normalized]:
        if len(paragraph) > char_limit:
            if current:
                chunks.append(" ".join(current).strip())
                current = []
                current_len = 0
            for start in range(0, len(paragraph), char_limit):
                segment = paragraph[start:start + char_limit].strip()
                if segment:
                    chunks.append(segment)
            continue
        if current and current_len + len(paragraph) + 1 > char_limit:
            chunks.append(" ".join(current).strip())
            current = [paragraph]
            current_len = len(paragraph)
        else:
            current.append(paragraph)
            current_len += len(paragraph) + 1
    if current:
        chunks.append(" ".join(current).strip())
    return [chunk for chunk in chunks if chunk]


def _group_text_chunks(
    chunks: list[str],
    *,
    token_limit: int,
    max_chunks: int,
) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    current: list[tuple[int, str]] = []
    current_tokens = 0

    def flush() -> None:
        nonlocal current, current_tokens
        if not current:
            return
        groups.append({
            "group_index": len(groups),
            "source_chunk_indexes": [index for index, _ in current],
            "text": "\n\n".join(f"[Transcript chunk {index + 1}]\n{text}" for index, text in current),
            "source_chunk_count": len(current),
        })
        current = []
        current_tokens = 0

    for index, chunk in enumerate(chunks):
        tokens = estimate_tokens(chunk)
        if current and (len(current) >= max_chunks or current_tokens + tokens > token_limit):
            flush()
        current.append((index, chunk))
        current_tokens += tokens
    flush()
    return groups


def _primary_youtube_providers() -> list[str]:
    available = get_available_providers()
    ordered = [provider for provider in ["groq", "gemini"] if provider in available]
    return ordered


def _create_deck_from_cards(
    *,
    user_id: str,
    title: str,
    description: str,
    cards: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    deck_res = supabase.table("decks").insert({
        "user_id": user_id,
        "title": title,
        "description": description,
    }).execute()
    if not deck_res.data:
        raise RuntimeError("Failed to create deck")
    deck = deck_res.data[0]
    card_rows = [
        {
            "deck_id": deck["deck_id"],
            "question": card["question"],
            "answer": card["answer"],
            "explanation": card.get("explanation"),
            "image_key": card.get("image_key"),
            "notes_image_key": card.get("notes_image_key"),
            "card_order": index + 1,
        }
        for index, card in enumerate(cards)
    ]
    cards_res = supabase.table("cards").insert(card_rows).execute()
    for card in cards_res.data or []:
        create_initial_review_state(user_id, deck["deck_id"], card["card_id"])
    return deck, cards_res.data or []


def _store_generated_cards(
    *,
    job_id: str | None,
    upload_id: str,
    chunk_id: str | None,
    provider_name: str,
    cards: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows = []
    for card in cards:
        question = (card.get("question") or "").strip()
        answer = (card.get("answer") or "").strip()
        if not question or not answer:
            continue
        rows.append({
            "job_id": job_id,
            "upload_id": upload_id,
            "chunk_id": chunk_id,
            "provider_name": provider_name,
            "card_type": card.get("card_type") or "qa",
            "question": question,
            "answer": answer,
            "explanation": (card.get("explanation") or "").strip() or None,
            "image_key": card.get("image_key"),
            "notes_image_key": card.get("notes_image_key"),
            "normalized_question": normalize_question(question),
            "quality_score": card.get("quality_score") or _score_card(card),
            "status": "staged",
        })
    if not rows:
        return []
    return supabase.table("generated_cards").insert(rows).execute().data or []


def _build_topup_context(
    *,
    document_summary: str,
    concepts: list[dict[str, Any]],
    existing_cards: list[dict[str, Any]],
    missing_count: int,
) -> str:
    concept_lines = [
        f"- {concept.get('term')} ({concept.get('concept_type') or 'concept'})"
        for concept in concepts[:30]
        if concept.get("term")
    ]
    existing_questions = [
        f"- {card.get('question')}"
        for card in existing_cards[:60]
        if card.get("question")
    ]
    return (
        "Generate additional flashcards for the same PDF. "
        f"The deck still needs exactly {missing_count} more distinct flashcards. "
        "Use only the summary and concepts below. Do not repeat existing questions.\n\n"
        f"Document summary:\n{document_summary or 'No summary available.'}\n\n"
        f"Important concepts:\n{chr(10).join(concept_lines) or 'No concepts available.'}\n\n"
        f"Existing questions to avoid:\n{chr(10).join(existing_questions) or 'None'}"
    )


def _top_up_cards_to_requested_count(
    *,
    upload_id: str,
    job_id: str | None,
    requested_cards: int,
    current_cards: list[dict[str, Any]],
    document_summary: str,
    concepts: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], bool]:
    cards = _rank_cards(get_unique_valid_cards(current_cards), requested_cards)
    rate_limited = False
    providers = _routeable_providers()

    for attempt in range(REDUCER_TOPUP_ATTEMPTS):
        missing_count = requested_cards - len(cards)
        if missing_count <= 0:
            break
        topup_context = _build_topup_context(
            document_summary=document_summary,
            concepts=concepts,
            existing_cards=cards,
            missing_count=missing_count,
        )
        provider_name = choose_round_robin_provider(attempt, providers)
        ask_count = max(1, min(MAX_CARDS_PER_CHUNK, missing_count + CARD_OVERGENERATION_BUFFER))
        try:
            log_structured_event(
                "generation.provider_call",
                generation_id=job_id,
                job_id=job_id,
                upload_id=upload_id,
                source="pdf",
                provider=provider_name,
                call_type="cards",
                chunk_count=0,
                token_estimate=estimate_tokens(topup_context),
            )
            _log_provider_call(job_id, provider_name, "cards")
            record_processing_event(
                upload_id=upload_id,
                stage="GENERATING_CARDS",
                code="LLM_CARD_CALL",
                message="Reducer card generation provider call",
                provider_name=provider_name,
                metadata={
                    "job_id": job_id,
                    "attempt": attempt + 1,
                    "cards_requested": ask_count,
                    "token_estimate": estimate_tokens(topup_context),
                },
            )
            result = generate_flashcards_with_provider(
                topup_context,
                ask_count,
                provider_name,
                include_artifacts=False,
            )
            record_provider_health(provider_name, success=True, result=result)
            inserted = _store_generated_cards(
                job_id=job_id,
                upload_id=upload_id,
                chunk_id=None,
                provider_name=provider_name,
                cards=result.flashcards,
            )
            cards = _rank_cards(get_unique_valid_cards([*cards, *inserted]), requested_cards)
            _refresh_pdf_llm_call_metrics(upload_id, job_id)
        except AIProviderRateLimitError as exc:
            rate_limited = True
            record_provider_health(provider_name, success=False)
            capture_backend_exception(
                RuntimeError(f"{provider_name} provider rate limited during reducer top-up"),
                feature="ai_generation",
                action="reducer_topup_rate_limited",
                tags={
                    "provider": provider_name,
                    "upload_id": upload_id,
                    "job_id": job_id,
                    "error_code": "LLM_RATE_LIMIT",
                },
                extra={"missing_count": missing_count, "attempt": attempt + 1, "message": str(exc)},
            )
            alternate = choose_alternate_provider(provider_name, providers)
            if alternate:
                providers = [alternate, *[provider for provider in providers if provider != alternate]]
            continue
        except Exception as exc:
            record_provider_health(provider_name, success=False)
            capture_backend_exception(
                exc,
                feature="ai_generation",
                action="reducer_topup_failed",
                tags={"provider": provider_name, "upload_id": upload_id, "job_id": job_id},
                extra={"missing_count": missing_count, "attempt": attempt + 1},
            )

    return cards, rate_limited


def _store_concepts(
    *,
    job_id: str | None,
    upload_id: str,
    chunk_id: str,
    concepts: list[dict[str, Any]] | None,
) -> None:
    rows = []
    for concept in concepts or []:
        term = sanitize_db_text(str(concept.get("term") or "").strip())
        if len(term) < 2:
            continue
        rows.append({
            "job_id": job_id,
            "upload_id": upload_id,
            "chunk_id": chunk_id,
            "concept_type": sanitize_db_text(str(concept.get("concept_type") or "concept"))[:40],
            "term": term[:180],
            "definition": sanitize_db_text(str(concept.get("definition") or ""))[:1200],
            "relationships": concept.get("relationships") if isinstance(concept.get("relationships"), list) else [],
            "examples": concept.get("examples") if isinstance(concept.get("examples"), list) else [],
            "importance_score": max(0, min(1, float(concept.get("importance_score") or 0.5))),
        })
    if rows:
        supabase.table("extracted_concepts").insert(rows).execute()


def process_provider_chunk(message: dict[str, Any], provider_name: str) -> None:
    chunk_id = message["chunk_id"]
    chunk = _load_chunk(chunk_id)
    upload_id = chunk["upload_id"]
    job_id = chunk.get("job_id")
    enqueue_next_for_provider: str | None = None
    if _is_upload_cancelled(upload_id):
        _mark_chunk(chunk_id, {
            "status": "cancelled",
            "error_code": "USER_ABORTED",
            "error_message": USER_SAFE_UPLOAD_ERRORS["USER_ABORTED"],
        })
        return
    _mark_chunk(chunk_id, {"status": "processing", "assigned_provider": provider_name})
    try:
        log_structured_event(
            "generation.provider_call",
            generation_id=job_id,
            job_id=job_id,
            upload_id=upload_id,
            source="pdf",
            provider=provider_name,
            call_type="summary",
            chunk_id=chunk_id,
            chunk_index=chunk.get("chunk_index"),
            token_estimate=chunk.get("token_estimate"),
        )
        _log_provider_call(job_id, provider_name, "summary")
        result = generate_summary_with_provider(
            chunk.get("chunk_text") or chunk.get("text_preview") or "",
            provider_name,
        )
        if _is_upload_cancelled(upload_id):
            _mark_chunk(chunk_id, {
                "status": "cancelled",
                "error_code": "USER_ABORTED",
                "error_message": USER_SAFE_UPLOAD_ERRORS["USER_ABORTED"],
            })
            return
        record_provider_health(provider_name, success=True, result=result)
        _store_concepts(
            job_id=job_id,
            upload_id=upload_id,
            chunk_id=chunk_id,
            concepts=result.concepts,
        )
        supabase.table("chunk_summaries").insert({
            "job_id": job_id,
            "upload_id": upload_id,
            "chunk_id": chunk_id,
            "provider_name": provider_name,
            "summary": sanitize_db_text(result.summary or (chunk.get("heading") or "Chunk"))[:3000],
            "key_points": result.key_points or [],
            "prompt_tokens": result.prompt_tokens,
            "completion_tokens": result.completion_tokens,
            "latency_ms": result.latency_ms,
        }).execute()
        _refresh_pdf_llm_call_metrics(upload_id, job_id)
        _mark_chunk(chunk_id, {"status": "completed"})
        enqueue_next_for_provider = provider_name
    except Exception as exc:
        record_provider_health(provider_name, success=False)
        if isinstance(exc, AIProviderRateLimitError):
            capture_backend_exception(
                RuntimeError(f"{provider_name} provider rate limited"),
                feature="ai_generation",
                action="provider_rate_limited",
                tags={
                    "provider": provider_name,
                    "upload_id": upload_id,
                    "job_id": job_id,
                    "chunk_id": chunk_id,
                    "error_code": "LLM_RATE_LIMIT",
                },
                extra={
                    "chunk_index": chunk.get("chunk_index"),
                    "fallback_count": int(chunk.get("fallback_count") or 0),
                    "attempts": int(chunk.get("attempts") or 0),
                    "message": str(exc),
                },
            )
            alternate = choose_alternate_provider(provider_name, _routeable_providers())
            attempts = int(chunk.get("attempts") or 0) + 1
            if _is_upload_cancelled(upload_id):
                _mark_chunk(chunk_id, {
                    "status": "cancelled",
                    "error_code": "USER_ABORTED",
                    "error_message": USER_SAFE_UPLOAD_ERRORS["USER_ABORTED"],
                })
                return
            if alternate and attempts <= 3:
                _mark_chunk(chunk_id, {
                    "status": "queued",
                    "attempts": attempts,
                    "fallback_count": int(chunk.get("fallback_count") or 0) + 1,
                    "assigned_provider": alternate,
                    "error_code": "LLM_RATE_LIMIT",
                    "error_message": str(exc),
                })
                _send_message(
                    _provider_queue_env(alternate),
                    {
                        "chunk_id": chunk_id,
                        "upload_id": upload_id,
                        "job_id": job_id,
                        "provider_name": alternate,
                    },
                    delay_seconds=[2, 5, 10][min(attempts - 1, 2)],
                )
                _enqueue_next_waiting_chunk(
                    upload_id=upload_id,
                    job_id=job_id,
                    provider_name=provider_name,
                    delay_seconds=PROVIDER_RATE_LIMIT_COOLDOWN_SECONDS,
                )
                return
        attempts = int(chunk.get("attempts") or 0) + 1
        alternate = choose_alternate_provider(provider_name, _routeable_providers())
        if alternate and attempts <= 3:
            record_processing_event(
                upload_id=upload_id,
                stage="GENERATING_CARDS",
                level="warning",
                code="PROVIDER_FALLBACK",
                message="Chunk moved to alternate provider after provider failure",
                provider_name=provider_name,
                metadata={
                    "chunk_id": chunk_id,
                    "chunk_index": chunk.get("chunk_index"),
                    "alternate_provider": alternate,
                    "attempts": attempts,
                    "error_type": exc.__class__.__name__,
                    "error_message": str(exc)[:500],
                },
            )
            _mark_chunk(chunk_id, {
                "status": "queued",
                "attempts": attempts,
                "fallback_count": int(chunk.get("fallback_count") or 0) + 1,
                "assigned_provider": alternate,
                "error_code": "PROVIDER_UNAVAILABLE",
                "error_message": str(exc),
            })
            _send_message(
                _provider_queue_env(alternate),
                {
                    "chunk_id": chunk_id,
                    "upload_id": upload_id,
                    "job_id": job_id,
                    "provider_name": alternate,
                },
                delay_seconds=[2, 5, 10][min(attempts - 1, 2)],
            )
            _enqueue_next_waiting_chunk(
                upload_id=upload_id,
                job_id=job_id,
                provider_name=provider_name,
            )
            return
        _mark_chunk(chunk_id, {
            "status": "failed",
            "error_code": "LLM_RATE_LIMIT" if isinstance(exc, AIProviderRateLimitError) else "AI_GENERATION_FAILED",
            "error_message": str(exc),
        })
        enqueue_next_for_provider = provider_name
        capture_backend_exception(
            exc,
            feature="ai_generation",
            action="provider_chunk_worker_failed",
            tags={"provider": provider_name, "chunk_id": chunk_id, "upload_id": upload_id},
        )
    finally:
        if enqueue_next_for_provider:
            _enqueue_next_waiting_chunk(
                upload_id=upload_id,
                job_id=job_id,
                provider_name=enqueue_next_for_provider,
            )
        _maybe_enqueue_reducer(upload_id, job_id)


def _maybe_enqueue_reducer(upload_id: str, job_id: str | None) -> None:
    if _is_upload_cancelled(upload_id):
        return
    chunks = supabase.table("generation_chunks").select("status").eq("upload_id", upload_id).execute().data or []
    total = len(chunks)
    completed = len([chunk for chunk in chunks if chunk.get("status") == "completed"])
    failed = len([chunk for chunk in chunks if chunk.get("status") == "failed"])
    if job_id:
        progress = 35 + int(((completed + failed) / max(1, total)) * 45)
        update_generation_job(
            job_id,
            stage="GENERATING_CARDS",
            progress=progress,
            completed_chunks=completed,
            failed_chunks=failed,
        )
    update_upload_job(upload_id, stage="GENERATING", progress=35 + int(((completed + failed) / max(1, total)) * 45))
    if total and completed + failed >= total:
        upload_rows = supabase.table("uploads").select("processing_stage,processing_status,deck_id").eq("upload_id", upload_id).limit(1).execute().data or []
        upload = upload_rows[0] if upload_rows else {}
        if upload.get("deck_id") or upload.get("processing_status") == "completed" or upload.get("processing_stage") in {"DEDUPLICATING", "COMPLETED"}:
            return
        update_upload_job(upload_id, stage="DEDUPLICATING", progress=85)
        _send_message("REDUCE_QUEUE_URL", {"upload_id": upload_id, "job_id": job_id})


def reduce_generation_job(message: dict[str, Any]) -> None:
    upload_id = message["upload_id"]
    job_id = message.get("job_id")
    reducer_retry_count = int(message.get("reducer_retry_count") or 0)
    upload = supabase.table("uploads").select("*").eq("upload_id", upload_id).limit(1).execute().data[0]
    if upload.get("deck_id") or upload.get("processing_status") in {"completed", "cancelled"}:
        return
    job_rows = supabase.table("generation_jobs").select("*").eq("job_id", job_id).limit(1).execute().data if job_id else []
    job = job_rows[0] if job_rows else {"requested_cards": 10, "user_id": upload["user_id"]}
    user_id = job.get("user_id") or upload["user_id"]
    requested_cards = max(5, min(int(job.get("requested_cards") or 10), 30))

    update_upload_job(upload_id, stage="DEDUPLICATING", progress=85)
    update_generation_job(job_id, stage="DEDUPLICATING", progress=85)
    summaries = supabase.table("chunk_summaries").select("summary,key_points").eq("upload_id", upload_id).execute().data or []
    concepts = (
        supabase.table("extracted_concepts")
        .select("concept_type,term,importance_score")
        .eq("upload_id", upload_id)
        .order("importance_score", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )
    document_summary = " ".join(
        sanitize_db_text(summary.get("summary")) for summary in summaries if summary.get("summary")
    )[:2400]
    generated = supabase.table("generated_cards").select("*").eq("upload_id", upload_id).execute().data or []
    valid_candidates = get_unique_valid_cards(generated)
    cards = _rank_cards(valid_candidates, requested_cards)
    topup_rate_limited = False

    if len(cards) < requested_cards and (document_summary or concepts):
        record_processing_event(
            upload_id=upload_id,
            stage="GENERATING_CARDS",
            level="warning",
            code="CARD_TOPUP_REQUIRED",
            message="Reducer is generating additional flashcards to match requested count",
            metadata={
                "requested_cards": requested_cards,
                "accepted_before_topup": len(cards),
                "missing_cards": requested_cards - len(cards),
                "reducer_retry_count": reducer_retry_count,
            },
        )
        update_upload_job(upload_id, status="processing", stage="GENERATING", progress=90)
        update_generation_job(job_id, status="processing", stage="GENERATING_CARDS", progress=90)
        cards, topup_rate_limited = _top_up_cards_to_requested_count(
            upload_id=upload_id,
            job_id=job_id,
            requested_cards=requested_cards,
            current_cards=cards,
            document_summary=document_summary,
            concepts=concepts,
        )

    if len(cards) < requested_cards and reducer_retry_count < REDUCER_REQUEUE_ATTEMPTS:
        delay_seconds = [30, 120, 300][min(reducer_retry_count, 2)]
        record_processing_event(
            upload_id=upload_id,
            stage="GENERATING_CARDS",
            level="warning",
            code="CARD_TOPUP_REQUEUED",
            message="Not enough flashcards yet; reducer will retry after provider cooldown",
            metadata={
                "requested_cards": requested_cards,
                "accepted_cards": len(cards),
                "missing_cards": requested_cards - len(cards),
                "delay_seconds": delay_seconds,
                "rate_limited": topup_rate_limited,
                "reducer_retry_count": reducer_retry_count + 1,
            },
        )
        update_upload_job(upload_id, status="processing", stage="GENERATING", progress=92)
        update_generation_job(job_id, status="processing", stage="GENERATING_CARDS", progress=92)
        _send_message(
            "REDUCE_QUEUE_URL",
            {
                "upload_id": upload_id,
                "job_id": job_id,
                "reducer_retry_count": reducer_retry_count + 1,
            },
            delay_seconds=delay_seconds,
        )
        return

    if len(cards) < requested_cards:
        metric_counts = _refresh_pdf_llm_call_metrics(upload_id, job_id)
        error_code = "LLM_RATE_LIMIT" if topup_rate_limited else "AI_GENERATION_FAILED"
        error_message = USER_SAFE_UPLOAD_ERRORS[error_code]
        record_processing_event(
            upload_id=upload_id,
            stage="VALIDATING_CARDS",
            level="error",
            code="CARD_TARGET_NOT_REACHED",
            message="Could not generate the requested number of unique flashcards after retries",
            metadata={
                "requested_cards": requested_cards,
                "accepted_cards": len(cards),
                "missing_cards": requested_cards - len(cards),
                "reducer_retry_count": reducer_retry_count,
                "rate_limited": topup_rate_limited,
                **metric_counts,
            },
        )
        update_upload_job(upload_id, status="failed", stage="FAILED", progress=100, error_code=error_code, error_message=error_message)
        update_generation_job(job_id, status="failed", stage="FAILED", progress=100, error_code=error_code, error_message=error_message)
        notify_upload_processing_result(user_id, upload_id, status="failed", error_message=error_message)
        return

    accepted_ids = [card.get("generated_card_id") for card in cards if card.get("generated_card_id")]
    all_ids = [card.get("generated_card_id") for card in generated if card.get("generated_card_id")]
    rejected_ids = [generated_card_id for generated_card_id in all_ids if generated_card_id not in accepted_ids]
    if accepted_ids:
        supabase.table("generated_cards").update({"status": "accepted"}).in_("generated_card_id", accepted_ids).execute()
    if rejected_ids:
        supabase.table("generated_cards").update({
            "status": "rejected",
            "rejection_reason": "duplicate_or_low_quality",
        }).in_("generated_card_id", rejected_ids).execute()

    minimum_required_cards = max(1, min(MIN_FINAL_CARDS_REQUIRED, requested_cards))
    if len(cards) < minimum_required_cards:
        error_code = "NO_VALID_CARDS"
        error_message = USER_SAFE_UPLOAD_ERRORS["NO_VALID_CARDS"]
        record_processing_event(
            upload_id=upload_id,
            stage="VALIDATING_CARDS",
            level="error",
            code=error_code,
            message="Reducer did not find any valid flashcards",
            metadata={
                "generated_candidates": len(generated),
                "valid_candidates": len(valid_candidates),
                "accepted_cards": len(cards),
                "requested_cards": requested_cards,
                "minimum_required_cards": minimum_required_cards,
                "min_quality_score": MIN_CARD_QUALITY_SCORE,
                "summary_count": len(summaries),
                "concept_count": len(concepts),
            },
        )
        update_upload_job(upload_id, status="failed", stage="FAILED", progress=100, error_code=error_code, error_message=error_message)
        update_generation_job(job_id, status="failed", stage="FAILED", progress=100, error_code=error_code, error_message=error_message)
        notify_upload_processing_result(user_id, upload_id, status="failed", error_message=error_message)
        return

    deck_title = generate_study_deck_title(
        source="pdf",
        content=document_summary,
        source_title=upload.get("file_name"),
        concepts=concepts,
        summaries=summaries,
        fallback_title=upload.get("file_name"),
    )

    deck_res = supabase.table("decks").insert({
        "user_id": user_id,
        "title": deck_title,
        "description": "Auto-generated from PDF",
    }).execute()
    if not deck_res.data:
        raise RuntimeError("Failed to create deck")
    deck = deck_res.data[0]
    card_rows = [
        {
            "deck_id": deck["deck_id"],
            "question": card["question"],
            "answer": card["answer"],
            "explanation": card.get("explanation"),
            "image_key": card.get("image_key"),
            "notes_image_key": card.get("notes_image_key"),
            "card_order": index + 1,
        }
        for index, card in enumerate(cards)
    ]
    cards_res = supabase.table("cards").insert(card_rows).execute()
    for card in cards_res.data or []:
        create_initial_review_state(user_id, deck["deck_id"], card["card_id"])

    record_processing_event(
        upload_id=upload_id,
        stage="COMPLETED",
        message="Reducer created final flashcard deck",
        metadata={
            "generated_candidates": len(generated),
            "valid_candidates": len(valid_candidates),
            "accepted_cards": len(cards_res.data or []),
            "requested_cards": requested_cards,
            "summary_count": len(summaries),
            "concept_count": len(concepts),
            "document_summary_preview": document_summary[:600],
            "top_concepts": concepts[:10],
            **_refresh_pdf_llm_call_metrics(upload_id, job_id),
        },
    )
    update_upload_job(upload_id, status="completed", stage="COMPLETED", progress=100, deck_id=deck["deck_id"])
    update_generation_job(job_id, status="completed", stage="COMPLETED", progress=100)
    consume_ai_generation_quota(user_id, source="pdf")
    log_ai_generation(user_id, upload_id, f"PDF flashcards: {upload.get('file_name') or 'uploaded_doc.pdf'}", len(cards_res.data or []))
    notify_upload_processing_result(user_id, upload_id, status="completed", deck_id=deck["deck_id"])


def _youtube_failure_payload(exc: Exception) -> tuple[str, str]:
    if isinstance(exc, YouTubeTranscriptError):
        code = getattr(exc, "error_code", "TRANSCRIPT_UNAVAILABLE")
        return code, USER_SAFE_YOUTUBE_ERRORS.get(code, USER_SAFE_YOUTUBE_ERRORS["TRANSCRIPT_UNAVAILABLE"])
    if isinstance(exc, AIProviderRateLimitError):
        return "AI_RATE_LIMITED", USER_SAFE_YOUTUBE_ERRORS["AI_RATE_LIMITED"]
    message = str(exc).lower()
    if "rate limit" in message or "429" in message or "too many request" in message:
        return "AI_RATE_LIMITED", USER_SAFE_YOUTUBE_ERRORS["AI_RATE_LIMITED"]
    if "no valid" in message or "not enough valid" in message:
        return "NO_VALID_CARDS", USER_SAFE_YOUTUBE_ERRORS["NO_VALID_CARDS"]
    if "deck" in message or "database" in message or "supabase" in message:
        return "DATABASE_FAILED", USER_SAFE_YOUTUBE_ERRORS["DATABASE_FAILED"]
    return "WORKER_FAILED", USER_SAFE_YOUTUBE_ERRORS["WORKER_FAILED"]


def _generate_youtube_summaries(
    *,
    generation_id: str,
    transcript: str,
    providers: list[str],
) -> tuple[list[dict[str, Any]], int, int, str | None]:
    chunks = _split_text_for_generation(transcript, YOUTUBE_CHUNK_CHAR_LIMIT)
    groups = _group_text_chunks(
        chunks,
        token_limit=YOUTUBE_SUMMARY_GROUP_TOKEN_LIMIT,
        max_chunks=YOUTUBE_SUMMARY_GROUP_MAX_CHUNKS,
    )
    log_structured_event(
        "generation.chunk_grouping",
        source="youtube",
        generation_id=generation_id,
        source_chunks=len(chunks),
        provider_calls_planned=len(groups),
        group_token_limit=YOUTUBE_SUMMARY_GROUP_TOKEN_LIMIT,
        group_max_chunks=YOUTUBE_SUMMARY_GROUP_MAX_CHUNKS,
    )
    summaries: list[dict[str, Any]] = []
    provider_call_count = 0
    provider_used: str | None = None

    for group in groups:
        provider_name = providers[group["group_index"] % len(providers)]
        try:
            log_structured_event(
                "generation.provider_call",
                generation_id=generation_id,
                source="youtube",
                provider=provider_name,
                call_type="summary",
                chunk_count=group["source_chunk_count"],
                token_estimate=estimate_tokens(group["text"]),
            )
            _log_provider_call(generation_id, provider_name, "summary")
            result = generate_summary_with_provider(group["text"], provider_name)
        except Exception:
            alternate = choose_alternate_provider(provider_name, providers)
            if not alternate:
                raise
            provider_name = alternate
            log_structured_event(
                "generation.provider_call",
                generation_id=generation_id,
                source="youtube",
                provider=provider_name,
                call_type="summary_fallback",
                chunk_count=group["source_chunk_count"],
                token_estimate=estimate_tokens(group["text"]),
            )
            _log_provider_call(generation_id, provider_name, "summary_fallback")
            result = generate_summary_with_provider(group["text"], provider_name)

        provider_call_count += 1
        provider_used = provider_name
        record_provider_health(provider_name, success=True, result=result)
        summaries.append({
            "summary": result.summary,
            "key_points": result.key_points,
            "concepts": result.concepts,
            "provider_name": provider_name,
            "latency_ms": result.latency_ms,
        })
        progress = 35 + int(((group["group_index"] + 1) / max(1, len(groups))) * 35)
        update_youtube_generation(
            generation_id,
            status="processing",
            stage="SUMMARIZING",
            progress=progress,
            provider_used=provider_used,
            provider_call_count=provider_call_count,
            summary_call_count=provider_call_count,
        )

    return summaries, provider_call_count, len(groups), provider_used


def _generate_youtube_cards(
    *,
    generation_id: str,
    summaries: list[dict[str, Any]],
    requested_cards: int,
    providers: list[str],
) -> tuple[list[dict[str, Any]], int, str | None]:
    summary_text = "\n\n".join(
        f"Summary {index + 1}:\n{summary.get('summary') or ''}\n"
        f"Key points: {', '.join(summary.get('key_points') or [])}"
        for index, summary in enumerate(summaries)
    )
    concepts = [
        concept
        for summary in summaries
        for concept in (summary.get("concepts") or [])
        if isinstance(concept, dict)
    ]
    concept_lines = [
        f"- {concept.get('term')} ({concept.get('concept_type') or 'concept'}): {concept.get('definition') or ''}"
        for concept in concepts[:40]
        if concept.get("term")
    ]
    context = (
        "Generate a high-quality flashcard deck from this YouTube transcript summary. "
        "Use only the provided summaries and concepts. Avoid duplicate questions.\n\n"
        f"Summaries:\n{summary_text[:16000]}\n\n"
        f"Important concepts:\n{chr(10).join(concept_lines) or 'No concepts available.'}"
    )

    provider_name = providers[0]
    try:
        log_structured_event(
            "generation.provider_call",
            generation_id=generation_id,
            source="youtube",
            provider=provider_name,
            call_type="cards",
            chunk_count=len(summaries),
            token_estimate=estimate_tokens(context),
        )
        _log_provider_call(generation_id, provider_name, "cards")
        result = generate_flashcards_with_provider(context, requested_cards + CARD_OVERGENERATION_BUFFER, provider_name)
    except Exception:
        alternate = choose_alternate_provider(provider_name, providers)
        if not alternate:
            raise
        provider_name = alternate
        log_structured_event(
            "generation.provider_call",
            generation_id=generation_id,
            source="youtube",
            provider=provider_name,
            call_type="cards_fallback",
            chunk_count=len(summaries),
            token_estimate=estimate_tokens(context),
        )
        _log_provider_call(generation_id, provider_name, "cards_fallback")
        result = generate_flashcards_with_provider(context, requested_cards + CARD_OVERGENERATION_BUFFER, provider_name)

    record_provider_health(provider_name, success=True, result=result)
    cards = _rank_cards(get_unique_valid_cards(result.flashcards), requested_cards)
    return cards, 1, provider_name


def _is_youtube_cancelled(generation_id: str) -> bool:
    try:
        res = supabase.table("youtube_generations").select("generation_status").eq("generation_id", generation_id).limit(1).execute()
        if res.data and res.data[0].get("generation_status") == "cancelled":
            return True
    except Exception:
        pass
    return False


def process_youtube_generation(message: dict[str, Any]) -> None:
    generation_id = message["generation_id"]
    started_at = datetime.datetime.utcnow()
    rows = supabase.table("youtube_generations").select("*").eq("generation_id", generation_id).limit(1).execute().data or []
    if not rows:
        raise RuntimeError(f"YouTube generation not found: {generation_id}")

    generation = rows[0]
    if generation.get("generation_status") == "cancelled":
        return

    user_id = message.get("user_id") or generation["user_id"]
    requested_cards = max(5, min(int(generation.get("requested_cards") or 10), 30))
    providers = _primary_youtube_providers()
    provider_call_count = 0
    summary_call_count = 0
    card_call_count = 0
    provider_used: str | None = None

    try:
        if not providers:
            raise RuntimeError("No AI providers are configured")

        if _is_youtube_cancelled(generation_id): return
        update_youtube_generation(generation_id, status="processing", stage="EXTRACTING_TRANSCRIPT", progress=10)
        transcript_result = fetch_transcript(generation["youtube_url"], generation.get("languages") or ["en"])
        if _is_youtube_cancelled(generation_id): return
        transcript_hash = hashlib.sha256(transcript_result.transcript.encode("utf-8")).hexdigest()
        settings_hash = _generation_settings_hash("youtube", requested_cards)
        update_youtube_generation(
            generation_id,
            status="processing",
            stage="PROCESSING_TRANSCRIPT",
            progress=25,
            video_id=transcript_result.video_id,
            transcript_length=transcript_result.transcript_length,
            transcript_hash=transcript_hash,
        )

        if _is_youtube_cancelled(generation_id): return
        cache_rows = (
            supabase.table("user_generation_cache")
            .select("*")
            .eq("user_id", user_id)
            .eq("content_hash", transcript_hash)
            .eq("generation_settings_hash", settings_hash)
            .limit(1)
            .execute()
            .data
            or []
        )
        if cache_rows:
            cached = cache_rows[0]
            cards = _rank_cards(get_unique_valid_cards(cached.get("generated_cards") or []), requested_cards)
            if cards:
                if _is_youtube_cancelled(generation_id): return
                update_youtube_generation(generation_id, status="processing", stage="CREATING_DECK", progress=85)
                deck_title = generate_study_deck_title(
                    source="youtube",
                    content=transcript_result.transcript[:10000],
                    source_title=generation.get("title"),
                    fallback_title=generation.get("title") or transcript_result.video_id,
                )
                if _is_youtube_cancelled(generation_id): return
                deck, saved_cards = _create_deck_from_cards(
                    user_id=user_id,
                    title=deck_title,
                    description=f"Auto-generated from YouTube video {transcript_result.video_id}",
                    cards=cards,
                )
                supabase.table("user_generation_cache").update({"last_used_at": _utcnow_iso()}).eq("generation_id", cached["generation_id"]).execute()
                duration_ms = round((datetime.datetime.utcnow() - started_at).total_seconds() * 1000)
                update_youtube_generation(
                    generation_id,
                    status="completed",
                    stage="COMPLETED",
                    progress=100,
                    deck_id=deck["deck_id"],
                    cards_generated=len(saved_cards),
                    provider_used=str((cached.get("provider_summary") or {}).get("provider_used") or "cache"),
                    provider_call_count=0,
                    summary_call_count=0,
                    card_call_count=0,
                    generation_duration_ms=duration_ms,
                )
                consume_ai_generation_quota(user_id, source="youtube")
                log_ai_generation(user_id, None, f"YouTube flashcards: {transcript_result.video_id}", len(saved_cards))
                return

        if _is_youtube_cancelled(generation_id): return
        update_youtube_generation(generation_id, status="processing", stage="SUMMARIZING", progress=35)
        summaries, provider_call_count, summary_call_count, provider_used = _generate_youtube_summaries(
            generation_id=generation_id,
            transcript=transcript_result.transcript,
            providers=providers,
        )
        if not summaries:
            raise RuntimeError("No transcript summaries were generated")

        if _is_youtube_cancelled(generation_id): return
        update_youtube_generation(generation_id, status="processing", stage="GENERATING_CARDS", progress=75)
        cards, card_call_count, card_provider = _generate_youtube_cards(
            generation_id=generation_id,
            summaries=summaries,
            requested_cards=requested_cards,
            providers=providers,
        )
        provider_call_count += card_call_count
        provider_used = card_provider or provider_used
        if len(cards) < max(1, min(MIN_FINAL_CARDS_REQUIRED, requested_cards)):
            raise RuntimeError("No valid cards generated")

        if _is_youtube_cancelled(generation_id): return
        update_youtube_generation(
            generation_id,
            status="processing",
            stage="CREATING_DECK",
            progress=90,
            provider_used=provider_used,
            provider_call_count=provider_call_count,
            summary_call_count=summary_call_count,
            card_call_count=card_call_count,
        )
        deck_title = generate_study_deck_title(
            source="youtube",
            content=transcript_result.transcript[:10000],
            source_title=generation.get("title"),
            summaries=summaries,
            fallback_title=generation.get("title") or transcript_result.video_id,
        )
        if _is_youtube_cancelled(generation_id): return
        deck, saved_cards = _create_deck_from_cards(
            user_id=user_id,
            title=deck_title,
            description=f"Auto-generated from YouTube video {transcript_result.video_id}",
            cards=cards,
        )

        supabase.table("user_generation_cache").upsert({
            "user_id": user_id,
            "content_hash": transcript_hash,
            "generation_settings_hash": settings_hash,
            "source_token_estimate": transcript_result.token_estimate,
            "requested_cards": requested_cards,
            "generated_cards": cards,
            "deck_title": deck_title,
            "card_count": len(saved_cards),
            "provider_summary": {
                "source": "youtube",
                "video_id": transcript_result.video_id,
                "provider_used": provider_used,
                "provider_call_count": provider_call_count,
                "summary_call_count": summary_call_count,
                "card_call_count": card_call_count,
            },
            "last_used_at": _utcnow_iso(),
            "updated_at": _utcnow_iso(),
        }, on_conflict="user_id,content_hash,generation_settings_hash").execute()

        duration_ms = round((datetime.datetime.utcnow() - started_at).total_seconds() * 1000)
        update_youtube_generation(
            generation_id,
            status="completed",
            stage="COMPLETED",
            progress=100,
            deck_id=deck["deck_id"],
            cards_generated=len(saved_cards),
            provider_used=provider_used,
            provider_call_count=provider_call_count,
            summary_call_count=summary_call_count,
            card_call_count=card_call_count,
            generation_duration_ms=duration_ms,
        )
        consume_ai_generation_quota(user_id, source="youtube")
        log_ai_generation(user_id, None, f"YouTube flashcards: {transcript_result.video_id}", len(saved_cards))
    except Exception as exc:
        if _is_youtube_cancelled(generation_id):
            return
        error_code, error_message = _youtube_failure_payload(exc)
        duration_ms = round((datetime.datetime.utcnow() - started_at).total_seconds() * 1000)
        update_youtube_generation(
            generation_id,
            status="failed",
            stage="FAILED",
            progress=100,
            error_code=error_code,
            error_message=error_message,
            provider_used=provider_used,
            provider_call_count=provider_call_count,
            summary_call_count=summary_call_count,
            card_call_count=card_call_count,
            generation_duration_ms=duration_ms,
        )
        capture_backend_exception(
            exc,
            feature="youtube_generation",
            action="youtube_worker_failed",
            tags={
                "user_id": user_id,
                "generation_id": generation_id,
                "video_id": generation.get("video_id"),
                "provider_used": provider_used,
                "error_code": error_code,
            },
            extra={
                "requested_cards": requested_cards,
                "provider_call_count": provider_call_count,
                "summary_call_count": summary_call_count,
                "card_call_count": card_call_count,
            },
        )
        raise


def _handle_records(event: dict[str, Any], handler, *args):
    processed = 0
    for record in event.get("Records", []):
        message = json.loads(record.get("body") or "{}")
        try:
            handler(message, *args)
            processed += 1
        except Exception as exc:
            upload_id = message.get("upload_id")
            job_id = message.get("job_id")
            error_code, error_message = _worker_failure_payload(exc)
            if upload_id:
                update_upload_job(
                    upload_id,
                    status="failed",
                    stage="FAILED",
                    progress=100,
                    error_code=error_code,
                    error_message=error_message,
                )
            if job_id:
                update_generation_job(
                    job_id,
                    status="failed",
                    stage="FAILED",
                    progress=100,
                    error_code=error_code,
                    error_message=error_message,
                )
            capture_backend_exception(
                exc,
                feature="upload",
                action="pipeline_worker_unhandled_failure",
                tags={
                    "upload_id": upload_id,
                    "job_id": job_id,
                    "handler": getattr(handler, "__name__", "unknown"),
                },
                extra={"message": message},
            )
            processed += 1
    return {"processed": processed}


def upload_orchestrator_handler(event, context):
    return _handle_records(event, process_upload_to_chunks)


def gemini_chunk_handler(event, context):
    return _handle_records(event, process_provider_chunk, "gemini")


def groq_chunk_handler(event, context):
    return _handle_records(event, process_provider_chunk, "groq")


def reducer_handler(event, context):
    return _handle_records(event, reduce_generation_job)


def youtube_worker_handler(event, context):
    return _handle_records(event, process_youtube_generation)
