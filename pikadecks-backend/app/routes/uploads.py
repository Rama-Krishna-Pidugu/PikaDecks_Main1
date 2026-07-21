import json
import os
import datetime
import io
from fastapi import APIRouter, Depends, HTTPException, Query
from pypdf import PdfReader
import requests

try:
    import boto3
    from botocore.config import Config
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False

from app.database import supabase, SUPABASE_URL, SUPABASE_KEY
from app.models.uploads import NotesProcessBody, UploadProcessBody, ImagePresignBody
from app.observability import capture_backend_exception
from app.services.ai_orchestrator import (
    AIProviderRateLimitError,
    AIProviderResult,
    choose_alternate_provider,
    choose_round_robin_provider,
    generate_flashcards_with_provider,
    get_available_providers,
)
from app.services.get_current_user import get_current_user
from app.services.file_cleanup import schedule_upload_file_cleanup
from app.services.ai_usage_quota import get_ai_generation_quota, consume_ai_generation_quota
from app.services.deck_titles import generate_study_deck_title
from app.services.entitlements import (
    require_flashcard_generation_access,
    require_pdf_generation_access,
)
from app.services.srs import create_initial_review_state


router = APIRouter(prefix="/uploads", tags=["uploads"])
MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024


USER_SAFE_UPLOAD_ERRORS = {
    "PREMIUM_REQUIRED": "Large PDF detected. Free plan supports PDFs up to 150 pages. Upgrade to Premium to generate flashcards from larger documents with advanced AI processing.",
    "PDF_DOWNLOAD_FAILED": "Document processing failed. Please try again later.",
    "PDF_TOO_LARGE": "The PDF file exceeds the maximum allowed size of 30 MB.",
    "PDF_EXTRACTION_FAILED": "Unable to extract readable text from the document.",
    "INSUFFICIENT_TEXT": "The uploaded file contains insufficient content for flashcard generation.",
    "AI_RATE_LIMITED": "AI generation is temporarily busy. Please try again later.",
    "LLM_RATE_LIMIT": "AI generation is temporarily busy. Your document is safe. Please try again shortly.",
    "AI_GENERATION_FAILED": "AI generation failed for this document. Please try again with fewer cards or a clearer PDF.",
    "NO_VALID_CARDS": "We could not create valid flashcards from this PDF. Try a clearer PDF or fewer cards.",
    "DATABASE_FAILED": "We generated your content but could not save it. Please try again later.",
    "QUEUE_FAILED": "We could not start background processing. Please try again later.",
    "WORKER_FAILED": "Background processing stopped unexpectedly. Please try again later.",
    "USER_ABORTED": "Flashcard generation was aborted.",
}

FREE_PLAN_MAX_PDF_PAGES = 150
MIN_FINAL_CARDS_REQUIRED = int(os.getenv("MIN_FINAL_CARDS_REQUIRED", "1"))


def update_upload_job(
    upload_id: str,
    *,
    status: str | None = None,
    stage: str | None = None,
    progress: int | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    deck_id: str | None = None,
    extracted_text: str | None = None,
):
    payload = {"updated_at": datetime.datetime.utcnow().isoformat()}
    if status is not None:
        payload["processing_status"] = status
    if stage is not None:
        payload["processing_stage"] = stage
    if progress is not None:
        payload["processing_progress"] = max(0, min(100, progress))
    if error_code is not None:
        payload["processing_error_code"] = error_code
    if error_message is not None:
        payload["processing_error_message"] = error_message
    if deck_id is not None:
        payload["deck_id"] = deck_id
    if extracted_text is not None:
        payload["extracted_text"] = sanitize_db_text(extracted_text)
    if status in {"completed", "COMPLETED", "cancelled", "CANCELLED"}:
        payload["completed_at"] = datetime.datetime.utcnow().isoformat()

    return supabase.table("uploads").update(payload).eq("upload_id", upload_id).execute()


def sanitize_db_text(text: str | None) -> str:
    if not text:
        return ""

    return text.replace("\x00", "")


def normalize_question(question: str | None) -> str:
    return " ".join((question or "").lower().strip().split())


def estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def record_processing_event(
    *,
    upload_id: str | None,
    stage: str,
    level: str = "info",
    code: str | None = None,
    message: str | None = None,
    provider_name: str | None = None,
    metadata: dict | None = None,
):
    if not upload_id:
        return
    try:
        supabase.table("processing_events").insert({
            "upload_id": upload_id,
            "stage": stage,
            "level": level,
            "code": code,
            "message": message,
            "provider_name": provider_name,
            "metadata": metadata or {},
        }).execute()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="upload",
            action="record_processing_event_failed",
            tags={"upload_id": upload_id, "stage": stage},
        )


def create_generation_job(
    *,
    upload_id: str | None,
    user_id: str,
    requested_cards: int,
    page_count: int | None,
    plan: str = "free",
):
    if not upload_id:
        return None
    try:
        response = supabase.table("generation_jobs").insert({
            "upload_id": upload_id,
            "user_id": user_id,
            "plan": plan,
            "requested_cards": requested_cards,
            "page_count": page_count,
            "status": "processing",
            "stage": "VALIDATING",
            "progress": 5,
            "priority": 100 if plan == "free" else 10,
        }).execute()
        if response.data:
            return response.data[0].get("job_id")
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="upload",
            action="create_generation_job_failed",
            tags={"upload_id": upload_id, "user_id": user_id},
        )
    return None


def update_generation_job(
    job_id: str | None,
    *,
    status: str | None = None,
    stage: str | None = None,
    progress: int | None = None,
    total_chunks: int | None = None,
    completed_chunks: int | None = None,
    failed_chunks: int | None = None,
    summary_calls: int | None = None,
    card_calls: int | None = None,
    total_llm_calls: int | None = None,
    provider_call_breakdown: dict | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
):
    if not job_id:
        return
    payload = {"updated_at": datetime.datetime.utcnow().isoformat()}
    if status is not None:
        payload["status"] = status
    if stage is not None:
        payload["stage"] = stage
    if progress is not None:
        payload["progress"] = max(0, min(100, progress))
    if total_chunks is not None:
        payload["total_chunks"] = total_chunks
    if completed_chunks is not None:
        payload["completed_chunks"] = completed_chunks
    if failed_chunks is not None:
        payload["failed_chunks"] = failed_chunks
    if summary_calls is not None:
        payload["summary_calls"] = summary_calls
    if card_calls is not None:
        payload["card_calls"] = card_calls
    if total_llm_calls is not None:
        payload["total_llm_calls"] = total_llm_calls
    if provider_call_breakdown is not None:
        payload["provider_call_breakdown"] = provider_call_breakdown
    if error_code is not None:
        payload["error_code"] = error_code
    if error_message is not None:
        payload["error_message"] = error_message
    if status == "completed":
        payload["completed_at"] = datetime.datetime.utcnow().isoformat()
    try:
        supabase.table("generation_jobs").update(payload).eq("job_id", job_id).execute()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="upload",
            action="update_generation_job_failed",
            tags={"job_id": job_id, "status": status, "stage": stage},
        )


def record_generation_chunk(
    *,
    job_id: str | None,
    upload_id: str | None,
    chunk_index: int,
    chunk_text: str,
    provider_name: str,
    status: str = "processing",
):
    if not upload_id:
        return None
    import hashlib

    try:
        response = supabase.table("generation_chunks").upsert({
            "upload_id": upload_id,
            "job_id": job_id,
            "chunk_index": chunk_index,
            "text_hash": hashlib.sha256(chunk_text.encode("utf-8")).hexdigest(),
            "text_preview": sanitize_db_text(chunk_text[:600]),
            "token_estimate": estimate_tokens(chunk_text),
            "assigned_provider": provider_name,
            "status": status,
            "updated_at": datetime.datetime.utcnow().isoformat(),
        }, on_conflict="upload_id,chunk_index").execute()
        if response.data:
            return response.data[0].get("chunk_id")
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="upload",
            action="record_generation_chunk_failed",
            tags={"upload_id": upload_id, "provider": provider_name},
            extra={"chunk_index": chunk_index},
        )
    return None


def update_generation_chunk_status(
    chunk_id: str | None,
    *,
    status: str,
    error_code: str | None = None,
    error_message: str | None = None,
    provider_name: str | None = None,
):
    if not chunk_id:
        return
    payload = {
        "status": status,
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }
    if error_code:
        payload["error_code"] = error_code
    if error_message:
        payload["error_message"] = error_message
    if provider_name:
        payload["assigned_provider"] = provider_name
    try:
        supabase.table("generation_chunks").update(payload).eq("chunk_id", chunk_id).execute()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="upload",
            action="update_generation_chunk_status_failed",
            tags={"chunk_id": chunk_id, "status": status},
        )


def record_generated_cards(
    *,
    job_id: str | None,
    upload_id: str | None,
    chunk_id: str | None,
    provider_name: str,
    cards: list,
):
    if not upload_id or not cards:
        return
    rows = []
    for card in get_unique_valid_cards(cards):
        rows.append({
            "upload_id": upload_id,
            "job_id": job_id,
            "chunk_id": chunk_id,
            "provider_name": provider_name,
            "card_type": "qa",
            "question": card["question"],
            "answer": card["answer"],
            "explanation": card.get("explanation"),
            "normalized_question": normalize_question(card["question"]),
            "quality_score": 0,
            "status": "staged",
        })
    if not rows:
        return
    try:
        supabase.table("generated_cards").insert(rows).execute()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="upload",
            action="record_generated_cards_failed",
            tags={"upload_id": upload_id, "provider": provider_name},
            extra={"card_count": len(rows)},
        )


def record_provider_health(provider_name: str, *, success: bool, result: AIProviderResult | None = None):
    try:
        existing = supabase.table("provider_health").select("*").eq("provider_name", provider_name).limit(1).execute()
        current = existing.data[0] if existing.data else {}
        now = datetime.datetime.utcnow().isoformat()
        success_count = int(current.get("success_count") or 0)
        failure_count = int(current.get("failure_count") or 0)
        average_latency = current.get("average_latency_ms")

        payload = {
            "provider_name": provider_name,
            "status": "CLOSED" if success else current.get("status") or "CLOSED",
            "success_count": success_count + (1 if success else 0),
            "failure_count": 0 if success else failure_count + 1,
            "updated_at": now,
        }
        if success:
            payload["last_success"] = now
        else:
            payload["last_failure"] = now
            if payload["failure_count"] >= 5:
                payload["status"] = "OPEN"
                payload["cooldown_until"] = (datetime.datetime.utcnow() + datetime.timedelta(minutes=10)).isoformat()
        if result:
            latency = result.latency_ms
            payload["average_latency_ms"] = latency if not average_latency else round((int(average_latency) + latency) / 2)
            payload["tokens_last_minute"] = result.prompt_tokens + result.completion_tokens
            payload["tokens_today"] = int(current.get("tokens_today") or 0) + result.prompt_tokens + result.completion_tokens

        supabase.table("provider_health").upsert(payload, on_conflict="provider_name").execute()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="ai_generation",
            action="record_provider_health_failed",
            tags={"provider": provider_name},
        )


def create_upload_job(user_id: str, body: UploadProcessBody):
    upload_res = supabase.table("uploads").insert({
        "user_id": user_id,
        "file_url": body.file_url,
        "file_name": body.file_name or "uploaded_doc.pdf",
        "file_type": body.file_type or "application/pdf",
        "processing_status": "pending",
        "processing_stage": "PENDING",
        "processing_progress": 0,
    }).execute()

    if not upload_res.data:
        raise HTTPException(status_code=502, detail="Could not create upload processing job.")

    return upload_res.data[0]


def get_upload_processing_queue_url(plan: str = "free") -> str | None:
    if plan == "pro":
        return os.getenv("PRO_UPLOAD_PROCESSING_QUEUE_URL") or os.getenv("UPLOAD_PROCESSING_QUEUE_URL")
    return os.getenv("UPLOAD_PROCESSING_QUEUE_URL")


def get_aws_region() -> str:
    return os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "ap-south-1"


def enqueue_upload_processing_job(upload_id: str, user_id: str, body: UploadProcessBody, *, plan: str = "free"):
    queue_url = get_upload_processing_queue_url(plan)
    if not queue_url:
        raise RuntimeError("UPLOAD_PROCESSING_QUEUE_URL is not configured")
    if not BOTO3_AVAILABLE:
        raise RuntimeError("boto3 is required to enqueue upload processing jobs")

    sqs_client = boto3.client("sqs", region_name=get_aws_region())
    sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps({
            "upload_id": upload_id,
            "user_id": user_id,
            "file_url": body.file_url,
            "file_name": body.file_name,
            "file_type": body.file_type,
            "num_cards": body.num_cards,
            "timezone": body.timezone,
            "plan": plan,
            "priority": 10 if plan == "pro" else 100,
        }),
    )


def get_today_upload_usage(user_id: str, timezone_name: str | None = None):
    # Kept for API compatibility with the frontend. The quota window is now
    # server-owned and rolling; client timezone is intentionally ignored.
    return get_ai_generation_quota(user_id)


def enforce_today_upload_limit(user_id: str, timezone_name: str | None = None):
    usage = get_today_upload_usage(user_id, timezone_name)
    if usage.get("unlimited"):
        return usage
    if usage["remaining"] <= 0:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "FREE_LIMIT_REACHED",
                "message": "You have used all 10 free AI generations for this 24-hour period. Please try again after the reset time or upgrade to Pro.",
                "usage": usage,
                "upgradeAvailable": True,
            },
        )

    return usage


def get_llm_model_name():
    if os.getenv("GROQ_API_KEY"):
        return os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile"
    if os.getenv("GEMINI_API_KEY"):
        return os.getenv("GEMINI_MODEL") or "gemini-3.1-pro-preview"
    return os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile"


def log_ai_generation(
    user_id: str,
    upload_id: str | None,
    prompt_used: str,
    generated_cards_count: int,
):
    supabase.table("ai_generations").insert({
        "user_id": user_id,
        "upload_id": upload_id,
        "prompt_used": prompt_used,
        "model_name": get_llm_model_name(),
        "generated_cards_count": generated_cards_count,
        "tokens_used": 0,
        "generation_status": "completed",
    }).execute()


def notify_upload_processing_result(
    user_id: str,
    upload_id: str,
    *,
    status: str,
    deck_id: str | None = None,
    error_message: str | None = None,
):
    title = "Your flashcards are ready" if status == "completed" else "Flashcard generation failed"
    message = (
        "Your flashcards are ready."
        if status == "completed"
        else (error_message or "Document processing failed. Please try again later.")
    )
    idempotency_key = f"upload-{upload_id}-{status}"
    data = {
        "type": "flashcard_generation",
        "target": f"/deck/{deck_id}" if (status == "completed" and deck_id) else "/home",
        "route": f"/dashboard/deck/{deck_id}" if (status == "completed" and deck_id) else "/dashboard",
        "upload_id": upload_id,
        "status": status,
        "idempotency_key": idempotency_key,
    }
    if deck_id:
        data["deck_id"] = deck_id

    try:
        tokens_res = (
            supabase.table("user_push_tokens")
            .select("push_token")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )

        sent = 0
        failed = 0
        provider_message_id = None

        if tokens_res.data:
            from notificationservices.notifier import initialize_firebase, is_unregistered_token_error, send_push

            initialize_firebase()
            for token_row in tokens_res.data:
                try:
                    provider_message_id = send_push(
                        token_row["push_token"],
                        title,
                        message,
                        data={key: str(value) for key, value in data.items()},
                    )
                    sent += 1
                except Exception as push_exc:
                    if is_unregistered_token_error(push_exc):
                        supabase.table("user_push_tokens").update({
                            "is_active": False,
                            "updated_at": datetime.datetime.utcnow().isoformat(),
                        }).eq("push_token", token_row["push_token"]).execute()
                        failed += 1
                        continue
                    failed += 1
                    capture_backend_exception(
                        push_exc,
                        feature="notifications",
                        action="send_upload_processing_push_failed",
                        tags={
                            "user_id": user_id,
                            "upload_id": upload_id,
                            "status": status,
                        },
                    )

        supabase.table("notification_logs").upsert({
            "user_id": user_id,
            "notification_type": "flashcard_generation",
            "title": title,
            "body": message,
            "status": "sent" if sent or not failed else "failed",
            "data": {**data, "sent": sent, "failed": failed},
            "provider_message_id": provider_message_id,
            "error_message": None if sent or not failed else message,
            "idempotency_key": idempotency_key,
        }, on_conflict="idempotency_key").execute()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="notifications",
            action="record_upload_processing_notification_failed",
            tags={
                "user_id": user_id,
                "upload_id": upload_id,
                "status": status,
            },
        )


def clean_and_trim_text(text: str) -> str:
    """
    Cleans extracted text by stripping common PDF disclaimers, copyrights, 
    references, bibliographies, and double whitespaces to save LLM tokens.
    """
    if not text:
        return ""

    text = sanitize_db_text(text)
        
    import re
    lines = text.split("\n")
    cleaned_lines = []
    
    # Common boilerplate indicators to skip entirely
    skip_keywords = [
        "all rights reserved", "copyright ©", "published by", "isbn ", 
        "table of contents", "bibliography", "references", "index"
    ]
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
            
        lower_stripped = stripped.lower()
        if any(keyword in lower_stripped for keyword in skip_keywords):
            continue
            
        cleaned_lines.append(stripped)
        
    compressed = " ".join(cleaned_lines)
    compressed = re.sub(r'\s+', ' ', compressed)
    return compressed.strip()


def generate_flashcards(text, max_cards=20):
    # Force dynamic .env reload to pick up provider credentials updated after uvicorn started.
    from dotenv import load_dotenv
    load_dotenv(override=True)

    providers = get_available_providers()
    last_error: Exception | None = None

    for provider_name in providers:
        try:
            result = generate_flashcards_with_provider(text, max_cards, provider_name)
            record_provider_health(provider_name, success=True, result=result)
            return result.flashcards
        except Exception as exc:
            last_error = exc
            record_provider_health(provider_name, success=False)
            capture_backend_exception(
                exc,
                feature="ai_generation",
                action="notes_generation_provider_failed",
                tags={
                    "provider": provider_name,
                    "model": get_llm_model_name(),
                    "component": "ai_provider",
                },
                extra={
                    "max_cards": max_cards,
                    "input_length": len(text or ""),
                },
            )
            continue

    if isinstance(last_error, AIProviderRateLimitError):
        raise AIProviderRateLimitError("AI provider rate limit reached") from last_error
    raise RuntimeError("AI flashcard generation failed. Please try again with a smaller or clearer document.") from last_error


def get_unique_valid_cards(cards: list) -> list:
    seen_questions = set()
    valid_cards = []

    for card in cards:
        if not isinstance(card, dict):
            continue

        question = str(card.get("question") or "").strip()
        answer = str(card.get("answer") or "").strip()
        explanation = str(card.get("explanation") or "").strip()
        normalized_question = " ".join(question.lower().split())

        if not question or not answer or not normalized_question:
            continue
        if normalized_question in seen_questions:
            continue

        seen_questions.add(normalized_question)
        valid_cards.append({
            "question": question,
            "answer": answer,
            "explanation": explanation,
            "image_url": card.get("image_url"),
            "notes_image_url": card.get("notes_image_url"),
        })

    return valid_cards


@router.get("/presigned-url")
def get_presigned_url(
    file_name: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Constructs a direct S3 or Supabase Storage upload destination URL and returns the headers.
    """
    # Force dynamic .env reload to pick up credentials updated after uvicorn started
    from dotenv import load_dotenv
    load_dotenv(override=True)

    user_id = current_user["user_id"]
    timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    clean_name = "".join(c for c in file_name if c.isalnum() or c in (".", "-", "_")).strip()
    unique_name = f"{timestamp}_{clean_name}"

    aws_access_key = os.getenv("PIKA_AWS_ACCESS_KEY_ID")
    aws_secret_key = os.getenv("PIKA_AWS_SECRET_ACCESS_KEY")
    aws_bucket = os.getenv("AWS_BUCKET_NAME") or os.getenv("S3_BUCKET")
    aws_region = os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "us-east-1"

    # Try dynamic import to be absolutely robust if boto3 was installed recently or globally
    dynamic_boto3 = None
    dynamic_config = None
    try:
        import boto3
        from botocore.config import Config
        dynamic_boto3 = boto3
        dynamic_config = Config
    except ImportError:
        pass

    # S3 uses explicit local keys when present, otherwise the Lambda IAM role.
    if dynamic_boto3 and aws_bucket:
        try:
            s3_client_kwargs = {
                "region_name": aws_region,
                "config": dynamic_config(signature_version="s3v4"),
            }
            if aws_access_key and aws_secret_key:
                s3_client_kwargs["aws_access_key_id"] = aws_access_key
                s3_client_kwargs["aws_secret_access_key"] = aws_secret_key

            s3_client = dynamic_boto3.client("s3", **s3_client_kwargs)
            
            key = f"pdfs/{user_id}/{unique_name}"
            upload_url = s3_client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": aws_bucket,
                    "Key": key,
                    "ContentType": "application/pdf",
                },
                ExpiresIn=3600,
            )
            file_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": aws_bucket, "Key": key},
                ExpiresIn=3600,
            )
            
            return {
                "success": True,
                "upload_url": upload_url,
                "file_url": file_url,
                "file_key": key,
                "headers": {}, # S3 url contains authorization signature directly in the query parameters!
            }
        except Exception as s3_err:
            capture_backend_exception(
                s3_err,
                feature="upload",
                action="s3_presigned_url_failed",
                tags={
                    "component": "s3",
                    "user_id": user_id,
                },
                extra={
                    "file_name": file_name,
                    "bucket": aws_bucket,
                    "region": aws_region,
                },
            )
            print(f"S3 URL Generation failed, falling back to Supabase: {s3_err}")

    # ── 2. Graceful Fallback: construct Supabase Storage bucket URLs ──
    upload_url = f"{SUPABASE_URL}/storage/v1/object/pdfs/{user_id}/{unique_name}"
    file_url = f"{SUPABASE_URL}/storage/v1/object/public/pdfs/{user_id}/{unique_name}"

    return {
        "success": True,
        "upload_url": upload_url,
        "file_url": file_url,
        "headers": {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
    }


@router.post("/image/presign")
def get_image_presigned_url(
    body: ImagePresignBody,
    current_user: dict = Depends(get_current_user),
):
    """
    Constructs a direct S3 or Supabase Storage upload destination URL for images and returns the headers.
    """
    from dotenv import load_dotenv
    load_dotenv(override=True)

    user_id = current_user["user_id"]
    timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    clean_name = "".join(c for c in body.file_name if c.isalnum() or c in (".", "-", "_")).strip()
    unique_name = f"{timestamp}_{clean_name}"

    aws_access_key = os.getenv("PIKA_AWS_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret_key = os.getenv("PIKA_AWS_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")
    aws_session_token = os.getenv("PIKA_AWS_SESSION_TOKEN") or os.getenv("AWS_SESSION_TOKEN")
    aws_bucket = os.getenv("AWS_BUCKET_NAME") or os.getenv("S3_BUCKET")
    aws_region = os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "us-east-1"
    content_type = body.content_type or "image/png"

    dynamic_boto3 = None
    dynamic_config = None
    try:
        import boto3
        from botocore.config import Config
        dynamic_boto3 = boto3
        dynamic_config = Config
    except ImportError:
        pass

    if dynamic_boto3 and aws_bucket:
        try:
            s3_client_kwargs = {
                "region_name": aws_region,
                "config": dynamic_config(signature_version="s3v4"),
            }
            if aws_access_key and aws_secret_key:
                s3_client_kwargs["aws_access_key_id"] = aws_access_key
                s3_client_kwargs["aws_secret_access_key"] = aws_secret_key
                if aws_session_token:
                    s3_client_kwargs["aws_session_token"] = aws_session_token

            s3_client = dynamic_boto3.client("s3", **s3_client_kwargs)
            
            key = f"images/{user_id}/{unique_name}"
            upload_url = s3_client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": aws_bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=3600,
            )
            file_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": aws_bucket, "Key": key},
                ExpiresIn=3600,
            )
            
            return {
                "success": True,
                "upload_url": upload_url,
                "file_url": file_url,
                "image_key": key,
                "headers": {},
            }
        except Exception as s3_err:
            capture_backend_exception(
                s3_err,
                feature="upload",
                action="s3_image_presigned_url_failed",
                tags={
                    "component": "s3",
                    "user_id": user_id,
                },
                extra={
                    "file_name": body.file_name,
                    "bucket": aws_bucket,
                    "region": aws_region,
                },
            )
            print(f"S3 Image URL Generation failed, falling back to Supabase: {s3_err}")

    # Fallback to Supabase Storage
    upload_url = f"{SUPABASE_URL}/storage/v1/object/images/{user_id}/{unique_name}"
    file_url = f"{SUPABASE_URL}/storage/v1/object/public/images/{user_id}/{unique_name}"

    return {
        "success": True,
        "upload_url": upload_url,
        "file_url": file_url,
        "headers": {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
    }


@router.get("/usage")
def get_upload_usage(
    timezone: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    usage = get_today_upload_usage(current_user["user_id"], timezone)
    return {
        "success": True,
        "usage": usage,
    }


@router.get("/active")
def get_active_jobs(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    
    # PDF Uploads
    uploads_res = (
        supabase.table("uploads")
        .select("upload_id,file_name,processing_status,processing_stage,processing_progress,deck_id,created_at")
        .eq("user_id", user_id)
        .in_("processing_status", ["pending", "processing"])
        .execute()
    )
    uploads = uploads_res.data or []
    
    # YouTube Generations
    yt_res = (
        supabase.table("youtube_generations")
        .select("generation_id,title,generation_status,processing_stage,processing_progress,deck_id,created_at")
        .eq("user_id", user_id)
        .in_("generation_status", ["queued", "processing"])
        .execute()
    )
    yt_jobs = yt_res.data or []
    
    jobs = []
    for u in uploads:
        jobs.append({
            "id": u["upload_id"],
            "type": "pdf",
            "title": u.get("file_name") or "Unnamed PDF Document",
            "status": u.get("processing_status"),
            "stage": u.get("processing_stage"),
            "progress": u.get("processing_progress") or 0,
            "deck_id": u.get("deck_id"),
            "created_at": u.get("created_at")
        })
        
    for y in yt_jobs:
        jobs.append({
            "id": y["generation_id"],
            "type": "youtube",
            "title": y.get("title") or "Unnamed YouTube Video",
            "status": y.get("generation_status"),
            "stage": y.get("processing_stage"),
            "progress": y.get("processing_progress") or 0,
            "deck_id": y.get("deck_id"),
            "created_at": y.get("created_at")
        })
        
    return {
        "success": True,
        "jobs": jobs
    }


@router.post("/process-async")
def process_pdf_async(
    body: UploadProcessBody,
    current_user: dict = Depends(get_current_user),
):
    plan = require_pdf_generation_access(current_user["user_id"], timezone_name=body.timezone)
    upload = create_upload_job(current_user["user_id"], body)
    upload_id = upload["upload_id"]

    try:
        enqueue_upload_processing_job(upload_id, current_user["user_id"], body, plan=plan)
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="upload",
            action="enqueue_upload_processing_failed",
            tags={
                "user_id": current_user.get("user_id"),
                "upload_id": upload_id,
                "component": "sqs",
            },
            extra={
                "file_url": body.file_url,
                "file_name": body.file_name,
                "file_type": body.file_type,
                "num_cards": body.num_cards,
                "timezone": body.timezone,
            },
        )
        update_upload_job(
            upload_id,
            status="failed",
            stage="FAILED",
            progress=100,
            error_code="QUEUE_FAILED",
            error_message=USER_SAFE_UPLOAD_ERRORS["QUEUE_FAILED"],
        )
        raise HTTPException(
            status_code=502,
            detail="Document processing failed. Please try again later.",
        ) from exc

    return {
        "success": True,
        "upload_id": upload_id,
        "status": upload.get("processing_stage") or "PENDING",
        "progress": upload.get("processing_progress") or 0,
    }


@router.get("/active")
def get_active_upload(
    current_user: dict = Depends(get_current_user),
):
    upload_res = (
        supabase.table("uploads")
        .select("upload_id,processing_status,processing_stage,processing_progress,processing_error_code,processing_error_message,deck_id,file_name,created_at,updated_at,completed_at")
        .eq("user_id", current_user["user_id"])
        .in_("processing_status", ["pending", "processing"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not upload_res.data:
        return {
            "success": True,
            "upload": None,
        }

    upload = upload_res.data[0]
    return {
        "success": True,
        "upload": {
            "upload_id": upload["upload_id"],
            "status": upload.get("processing_stage") or upload.get("processing_status"),
            "progress": upload.get("processing_progress") or 0,
            "error": {
                "code": upload.get("processing_error_code"),
                "message": upload.get("processing_error_message"),
            } if upload.get("processing_error_code") else None,
            "deck_id": upload.get("deck_id"),
            "file_name": upload.get("file_name"),
            "created_at": upload.get("created_at"),
            "updated_at": upload.get("updated_at"),
            "completed_at": upload.get("completed_at"),
        },
    }


@router.post("/{upload_id}/abort")
def abort_upload_processing(
    upload_id: str,
    current_user: dict = Depends(get_current_user),
):
    upload_res = (
        supabase.table("uploads")
        .select("upload_id,user_id,file_url,processing_status,processing_stage,deck_id")
        .eq("upload_id", upload_id)
        .eq("user_id", current_user["user_id"])
        .limit(1)
        .execute()
    )

    if not upload_res.data:
        raise HTTPException(status_code=404, detail="Upload processing job not found.")

    upload = upload_res.data[0]
    if upload.get("deck_id") or upload.get("processing_status") == "completed":
        raise HTTPException(status_code=409, detail="This upload has already completed.")

    update_upload_job(
        upload_id,
        status="cancelled",
        stage="CANCELLED",
        progress=100,
        error_code="USER_ABORTED",
        error_message=USER_SAFE_UPLOAD_ERRORS["USER_ABORTED"],
    )
    job_rows = (
        supabase.table("generation_jobs")
        .select("job_id")
        .eq("upload_id", upload_id)
        .in_("status", ["pending", "processing", "queued"])
        .execute()
        .data
        or []
    )
    for job in job_rows:
        update_generation_job(
            job["job_id"],
            status="cancelled",
            stage="CANCELLED",
            progress=100,
            error_code="USER_ABORTED",
            error_message=USER_SAFE_UPLOAD_ERRORS["USER_ABORTED"],
        )
    supabase.table("generation_chunks").update({
        "status": "cancelled",
        "error_code": "USER_ABORTED",
        "error_message": USER_SAFE_UPLOAD_ERRORS["USER_ABORTED"],
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }).eq("upload_id", upload_id).in_("status", ["pending", "queued", "processing", "staged"]).execute()
    schedule_upload_file_cleanup(
        upload_id=upload_id,
        user_id=upload.get("user_id") or current_user["user_id"],
        file_url=upload.get("file_url"),
        reason="upload_aborted",
    )

    return {
        "success": True,
        "upload_id": upload_id,
        "status": "CANCELLED",
        "message": USER_SAFE_UPLOAD_ERRORS["USER_ABORTED"],
    }


@router.get("/{upload_id}/status")
def get_upload_status(
    upload_id: str,
    current_user: dict = Depends(get_current_user),
):
    upload_res = (
        supabase.table("uploads")
        .select("upload_id,processing_status,processing_stage,processing_progress,processing_error_code,processing_error_message,deck_id,created_at,updated_at,completed_at")
        .eq("upload_id", upload_id)
        .eq("user_id", current_user["user_id"])
        .limit(1)
        .execute()
    )

    if not upload_res.data:
        raise HTTPException(status_code=404, detail="Upload processing job not found.")

    upload = upload_res.data[0]
    generation_rows = (
        supabase.table("generation_jobs")
        .select("job_id,total_chunks,summary_calls,card_calls,total_llm_calls,provider_call_breakdown")
        .eq("upload_id", upload_id)
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    generation = generation_rows[0] if generation_rows else None
    return {
        "success": True,
        "upload_id": upload["upload_id"],
        "status": upload.get("processing_stage") or upload.get("processing_status"),
        "progress": upload.get("processing_progress") or 0,
        "error": {
            "code": upload.get("processing_error_code"),
            "message": upload.get("processing_error_message"),
        } if upload.get("processing_error_code") else None,
        "deck_id": upload.get("deck_id"),
        "generation": {
            "generation_id": generation.get("job_id"),
            "total_chunks": generation.get("total_chunks") or 0,
            "summary_calls": generation.get("summary_calls") or 0,
            "card_calls": generation.get("card_calls") or 0,
            "total_llm_calls": generation.get("total_llm_calls") or 0,
            "provider_call_breakdown": generation.get("provider_call_breakdown") or {},
        } if generation else None,
        "created_at": upload.get("created_at"),
        "updated_at": upload.get("updated_at"),
        "completed_at": upload.get("completed_at"),
    }



@router.post("/process")
def process_pdf(
    body: UploadProcessBody,
    current_user: dict = Depends(get_current_user),
    upload_id: str | None = None,
):
    """
    Downloads a PDF from a public URL, robustly extracts its text using pypdf,
    sends it to Groq to generate cards, and stores the new deck in Supabase!
    """
    file_url = body.file_url
    job_id = None
    try:
        if upload_id:
            update_upload_job(upload_id, status="processing", stage="PROCESSING", progress=5)

        usage_before_generation = None

        # Force dynamic .env reload to pick up credentials updated after uvicorn started
        from dotenv import load_dotenv
        load_dotenv(override=True)

        # 1. Fetch PDF content (using private S3 download if applicable)
        is_s3_url = "amazonaws.com" in file_url
        aws_access_key = os.getenv("PIKA_AWS_ACCESS_KEY_ID")
        aws_secret_key = os.getenv("PIKA_AWS_SECRET_ACCESS_KEY")
        aws_bucket = os.getenv("AWS_BUCKET_NAME") or os.getenv("S3_BUCKET")
        aws_region = os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "us-east-1"

        print(f"[DEBUG] process_pdf: file_url={file_url}")
        print(f"[DEBUG] is_s3_url={is_s3_url}")
        print(f"[DEBUG] explicit_s3_access_key={'configured' if aws_access_key else 'not configured; using AWS role/default credentials'}")
        print(f"[DEBUG] explicit_s3_secret_key={'configured' if aws_secret_key else 'not configured; using AWS role/default credentials'}")
        print(f"[DEBUG] aws_bucket={aws_bucket}")
        print(f"[DEBUG] aws_region={aws_region}")

        # Try dynamic import to be absolutely robust if boto3 was installed recently or globally
        dynamic_boto3 = None
        dynamic_config = None
        try:
            import boto3
            from botocore.config import Config
            dynamic_boto3 = boto3
            dynamic_config = Config
            print("[DEBUG] boto3 imported successfully inside process_pdf.")
        except ImportError as imp_err:
            print(f"[DEBUG] Dynamic import of boto3 failed: {imp_err}")

        pdf_content = None

        if is_s3_url and dynamic_boto3 and aws_bucket:
            try:
                # Extract key from url after the domain name
                path = file_url.split("amazonaws.com/")[-1]

                s3_client_kwargs = {"region_name": aws_region}
                if aws_access_key and aws_secret_key:
                    s3_client_kwargs["aws_access_key_id"] = aws_access_key
                    s3_client_kwargs["aws_secret_access_key"] = aws_secret_key

                s3_client = dynamic_boto3.client("s3", **s3_client_kwargs)
                
                print(f"Downloading private file {path} from S3 bucket {aws_bucket}...")
                s3_obj = s3_client.get_object(Bucket=aws_bucket, Key=path)
                pdf_content = s3_obj["Body"].read()
                print(f"[DEBUG] Successfully downloaded {len(pdf_content)} bytes from S3.")
            except Exception as s3_get_err:
                capture_backend_exception(
                    s3_get_err,
                    feature="upload",
                    action="s3_pdf_download_failed",
                    tags={
                        "component": "s3",
                        "user_id": current_user["user_id"],
                    },
                    extra={
                        "file_url": file_url,
                        "bucket": aws_bucket,
                        "region": aws_region,
                    },
                )
                print(f"Private S3 download failed, falling back to public requests: {s3_get_err}")

        if pdf_content is None:
            print("[DEBUG] Falling back to public requests.get for file_url...")
            try:
                res = requests.get(file_url, timeout=20)
            except requests.RequestException as download_err:
                capture_backend_exception(
                    download_err,
                    feature="upload",
                    action="pdf_download_failed",
                    tags={
                        "component": "storage",
                        "user_id": current_user["user_id"],
                    },
                    extra={
                        "file_url": file_url,
                        "file_name": body.file_name,
                    },
                )
                raise

            if not res.ok:
                error = HTTPException(status_code=400, detail=f"Failed to fetch PDF from URL: {file_url}")
                capture_backend_exception(
                    error,
                    feature="upload",
                    action="pdf_download_bad_status",
                    tags={
                        "component": "storage",
                        "status_code": res.status_code,
                        "user_id": current_user["user_id"],
                    },
                    extra={
                        "file_url": file_url,
                        "file_name": body.file_name,
                    },
                )
                raise error
            pdf_content = res.content
        
        if len(pdf_content) > MAX_PDF_SIZE_BYTES:
            if upload_id:
                update_upload_job(
                    upload_id,
                    status="failed",
                    stage="FAILED",
                    progress=100,
                    error_code="PDF_TOO_LARGE",
                    error_message=USER_SAFE_UPLOAD_ERRORS["PDF_TOO_LARGE"],
                )
            raise HTTPException(
                status_code=400,
                detail="The PDF file exceeds the maximum allowed size of 30 MB."
            )
        
        # Calculate unique file hash
        import hashlib
        file_hash = hashlib.sha256(pdf_content).hexdigest()
        
        deck_title = generate_study_deck_title(
            source="pdf",
            content="\n\n".join(pages[:5]) or extracted_text[:10000],
            source_title=body.file_name,
            fallback_title=body.file_name,
        )

        # Generate cards only from this user's uploaded PDF.
        print(f"[DEBUG] Generating a private deck for uploaded PDF hash: {file_hash}")

        # Extract and trim text from PDF.
        pdf_file = io.BytesIO(pdf_content)
        try:
            if upload_id:
                update_upload_job(upload_id, stage="EXTRACTING", progress=15)
            reader = PdfReader(pdf_file)
            page_count = len(reader.pages)
            max_cards = max(5, min(body.num_cards or 10, 30))
            current_plan = require_pdf_generation_access(
                current_user["user_id"],
                page_count=page_count,
                timezone_name=body.timezone,
                consume_quota=not bool(upload_id),
            )
            usage_before_generation = enforce_today_upload_limit(current_user["user_id"], body.timezone)
            if upload_id:
                supabase.table("uploads").update({
                    "page_count": page_count,
                    "plan_at_upload": current_plan,
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                }).eq("upload_id", upload_id).execute()
            job_id = create_generation_job(
                upload_id=upload_id,
                user_id=current_user["user_id"],
                requested_cards=max_cards,
                page_count=page_count,
                plan=current_plan,
            )
            if page_count > FREE_PLAN_MAX_PDF_PAGES and current_plan == "free":
                message = (
                    f"Large PDF Detected. This document contains {page_count} pages. "
                    "Free plan supports PDFs up to 150 pages. Upgrade to Premium to generate "
                    "flashcards from larger documents with advanced AI processing."
                )
                if upload_id:
                    update_upload_job(
                        upload_id,
                        status="failed",
                        stage="FAILED",
                        progress=100,
                        error_code="PREMIUM_REQUIRED",
                        error_message=message,
                    )
                update_generation_job(
                    job_id,
                    status="failed",
                    stage="FAILED",
                    progress=100,
                    error_code="PREMIUM_REQUIRED",
                    error_message=message,
                )
                raise HTTPException(status_code=402, detail=message)
        except Exception as pdf_err:
            if isinstance(pdf_err, HTTPException):
                raise
            capture_backend_exception(
                pdf_err,
                feature="pdf_processing",
                action="pdf_reader_failed",
                tags={
                    "user_id": current_user["user_id"],
                },
                extra={
                    "file_name": body.file_name,
                    "file_size": len(pdf_content),
                },
            )
            if upload_id:
                update_upload_job(
                    upload_id,
                    status="failed",
                    stage="FAILED",
                    progress=100,
                    error_code="PDF_EXTRACTION_FAILED",
                    error_message=USER_SAFE_UPLOAD_ERRORS["PDF_EXTRACTION_FAILED"],
                )
            raise
        
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text and text.strip():
                # Aggressive text trimming on each page to compress spacing/remove boilerplate
                cleaned_page = clean_and_trim_text(text)
                if cleaned_page:
                    pages.append(cleaned_page)
        
        extracted_text = sanitize_db_text("\n\n".join(pages))
        if len(extracted_text.strip()) < 10:
            if upload_id:
                update_upload_job(
                    upload_id,
                    status="failed",
                    stage="FAILED",
                    progress=100,
                    error_code="INSUFFICIENT_TEXT",
                    error_message=USER_SAFE_UPLOAD_ERRORS["INSUFFICIENT_TEXT"],
                    extracted_text=extracted_text[:1800],
                )
            raise HTTPException(
                status_code=400,
                detail="PDF contains insufficient extractable text (e.g. it is scanned/images only).",
            )

        # Chunking Logic: split dense pages and sample large PDFs so we do not
        # create dozens of LLM calls for a small target card count.
        if upload_id:
            update_upload_job(upload_id, stage="CHUNKING", progress=30, extracted_text=extracted_text[:1800])
        update_generation_job(job_id, stage="CHUNKING", progress=30)
        chunk_char_limit = 12000
        source_segments = []
        for page in pages:
            if len(page) <= chunk_char_limit:
                source_segments.append(page)
                continue

            for start in range(0, len(page), chunk_char_limit):
                segment = page[start:start + chunk_char_limit].strip()
                if segment:
                    source_segments.append(segment)

        chunks = []
        current_chunk = []
        current_len = 0
        for segment in source_segments:
            if current_len + len(segment) > chunk_char_limit and current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = [segment]
                current_len = len(segment)
            else:
                current_chunk.append(segment)
                current_len += len(segment) + 2
        if current_chunk:
            chunks.append("\n\n".join(current_chunk))

        all_cards = []
        cards_per_chunk = min(5, max(3, max_cards)) if chunks else max_cards
        representative_chunk_count = min(
            len(chunks),
            max(1, ((max_cards + cards_per_chunk - 1) // cards_per_chunk) + 1),
        ) if chunks else 0
        fallback_chunk_limit = 10 if max_cards <= 10 else 14 if max_cards <= 20 else 18
        max_chunks_to_try = min(len(chunks), max(representative_chunk_count, fallback_chunk_limit)) if chunks else 0

        if representative_chunk_count == len(chunks):
            representative_indices = list(range(len(chunks)))
        elif representative_chunk_count <= 1:
            representative_indices = [0] if chunks else []
        else:
            last_index = len(chunks) - 1
            representative_indices = []
            for position in range(representative_chunk_count):
                index = round(position * last_index / (representative_chunk_count - 1))
                if index not in representative_indices:
                    representative_indices.append(index)

        fallback_indices = [index for index in range(len(chunks)) if index not in representative_indices]
        selected_indices = (representative_indices + fallback_indices)[:max_chunks_to_try]
        selected_chunks = [(index, chunks[index]) for index in selected_indices]

        print(
            f"[DEBUG] PDF chunk plan: pages={len(pages)}, segments={len(source_segments)}, "
            f"chunks={len(chunks)}, selected_chunks={len(selected_chunks)}, "
            f"cards_per_chunk={cards_per_chunk}, target_cards={max_cards}"
        )
        update_generation_job(job_id, stage="GENERATING_CARDS", progress=35, total_chunks=len(selected_chunks))

        chunk_errors = 0
        completed_chunk_count = 0
        rate_limited = False
        providers = get_available_providers()
        record_processing_event(
            upload_id=upload_id,
            stage="GENERATING_CARDS",
            message="Starting round-robin AI provider orchestration",
            metadata={
                "providers": providers,
                "selected_chunks": len(selected_chunks),
                "target_cards": max_cards,
            },
        )
        for selected_position, (chunk_index, chunk_text) in enumerate(selected_chunks):
            print(f"[DEBUG] Processing PDF chunk {chunk_index + 1}/{len(chunks)} ({len(chunk_text)} chars)...")
            if upload_id:
                chunk_progress = 35 + int(((selected_position + 1) / max(1, len(selected_chunks))) * 45)
                update_upload_job(upload_id, stage="GENERATING", progress=chunk_progress)
            provider_name = choose_round_robin_provider(chunk_index, providers)
            chunk_id = record_generation_chunk(
                job_id=job_id,
                upload_id=upload_id,
                chunk_index=chunk_index,
                chunk_text=chunk_text,
                provider_name=provider_name,
            )
            try:
                current_unique_cards = get_unique_valid_cards(all_cards)
                if len(current_unique_cards) >= max_cards:
                    break

                cards_needed = max(3, min(cards_per_chunk, max_cards - len(current_unique_cards) + 2))
                try:
                    provider_result = generate_flashcards_with_provider(
                        chunk_text,
                        cards_needed,
                        provider_name,
                    )
                except AIProviderRateLimitError as rate_limit_error:
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
                            "chunk_index": chunk_index,
                            "cards_needed": cards_needed,
                            "message": str(rate_limit_error),
                        },
                    )
                    alternate_provider = choose_alternate_provider(provider_name, providers)
                    if not alternate_provider:
                        raise
                    record_processing_event(
                        upload_id=upload_id,
                        stage="GENERATING_CARDS",
                        level="warning",
                        code="LLM_RATE_LIMIT",
                        message="Chunk moved to alternate provider after rate limit",
                        provider_name=provider_name,
                        metadata={
                            "chunk_index": chunk_index,
                            "alternate_provider": alternate_provider,
                        },
                    )
                    record_provider_health(provider_name, success=False)
                    provider_name = alternate_provider
                    update_generation_chunk_status(chunk_id, status="processing", provider_name=provider_name)
                    provider_result = generate_flashcards_with_provider(
                        chunk_text,
                        cards_needed,
                        provider_name,
                    )

                record_provider_health(provider_name, success=True, result=provider_result)
                chunk_cards = provider_result.flashcards
                all_cards.extend(chunk_cards)
                record_generated_cards(
                    job_id=job_id,
                    upload_id=upload_id,
                    chunk_id=chunk_id,
                    provider_name=provider_name,
                    cards=chunk_cards,
                )
                update_generation_chunk_status(chunk_id, status="completed", provider_name=provider_name)
                completed_chunk_count += 1
                update_generation_job(
                    job_id,
                    stage="GENERATING_CARDS",
                    progress=chunk_progress if upload_id else None,
                    completed_chunks=completed_chunk_count,
                    failed_chunks=chunk_errors,
                )
                if len(get_unique_valid_cards(all_cards)) >= max_cards:
                    break
            except Exception as chunk_err:
                chunk_errors += 1
                if isinstance(chunk_err, AIProviderRateLimitError):
                    rate_limited = True
                record_provider_health(provider_name, success=False)
                update_generation_chunk_status(
                    chunk_id,
                    status="failed",
                    error_code="LLM_RATE_LIMIT" if rate_limited else "AI_GENERATION_FAILED",
                    error_message=str(chunk_err),
                    provider_name=provider_name,
                )
                print(f"[WARNING] Chunk {chunk_index + 1} failed to generate flashcards: {chunk_err}")
                capture_backend_exception(
                    chunk_err,
                    feature="ai_generation",
                    action="pdf_chunk_generation_failed",
                    tags={
                        "user_id": current_user["user_id"],
                        "upload_id": upload_id,
                        "provider": provider_name,
                        "component": "upload_worker",
                    },
                    extra={
                        "chunk_index": chunk_index,
                        "total_chunks": len(chunks),
                        "selected_chunks": len(selected_chunks),
                        "chunk_length": len(chunk_text),
                        "file_name": body.file_name,
                        "rate_limited": rate_limited,
                    },
                )
                if rate_limited:
                    break

        cards = get_unique_valid_cards(all_cards)[:max_cards]

        minimum_required_cards = max(1, min(MIN_FINAL_CARDS_REQUIRED, max_cards))
        if len(cards) < minimum_required_cards:
             error_code = "AI_RATE_LIMITED" if rate_limited else "AI_GENERATION_FAILED"
             capture_backend_exception(
                 RuntimeError("PDF generation produced too few valid flashcards"),
                 feature="ai_generation",
                 action="pdf_generation_rate_limited" if rate_limited else "pdf_generation_too_few_cards",
                 tags={
                     "user_id": current_user["user_id"],
                     "upload_id": upload_id,
                     "component": "upload_worker",
                     "error_code": error_code,
                 },
                 extra={
                     "pages": len(pages),
                     "chunks": len(chunks),
                     "selected_chunks": len(selected_chunks),
                     "chunk_errors": chunk_errors,
                     "rate_limited": rate_limited,
                     "valid_cards": len(cards),
                     "minimum_required_cards": minimum_required_cards,
                     "file_name": body.file_name,
                 },
             )
             if upload_id:
                 update_upload_job(
                     upload_id,
                     status="failed",
                     stage="FAILED",
                     progress=100,
                     error_code=error_code,
                     error_message=USER_SAFE_UPLOAD_ERRORS[error_code],
                 )
             update_generation_job(
                 job_id,
                 status="failed",
                 stage="FAILED",
                 progress=100,
                 completed_chunks=completed_chunk_count,
                 failed_chunks=chunk_errors,
                 error_code=error_code,
                 error_message=USER_SAFE_UPLOAD_ERRORS[error_code],
             )
             raise HTTPException(status_code=429 if rate_limited else 500, detail=USER_SAFE_UPLOAD_ERRORS[error_code])

        # 4. Save Deck to database
        deck_res = (
            supabase.table("decks")
            .insert({
                "user_id": current_user["user_id"],
                "title": deck_title,
                "description": "Auto-generated from PDF"
            })
            .execute()
        )
        
        if not deck_res.data:
            if upload_id:
                update_upload_job(
                    upload_id,
                    status="failed",
                    stage="FAILED",
                    progress=100,
                    error_code="DATABASE_FAILED",
                    error_message=USER_SAFE_UPLOAD_ERRORS["DATABASE_FAILED"],
                )
            raise HTTPException(status_code=500, detail="Failed to create deck")
            
        deck = deck_res.data[0]
        
        # 5. Save Cards to database
        card_rows = []
        for index, c in enumerate(cards):
            card_rows.append({
                "deck_id": deck["deck_id"],
                "question": c.get("question"),
                "answer": c.get("answer"),
                "explanation": c.get("explanation"),
                "card_order": index + 1
            })
            
        cards_res = (
            supabase.table("cards")
            .insert(card_rows)
            .execute()
        )
        for card in cards_res.data or []:
            create_initial_review_state(current_user["user_id"], deck["deck_id"], card["card_id"])

        if upload_id:
            update_upload_job(
                upload_id,
                status="completed",
                stage="COMPLETED",
                progress=100,
                deck_id=deck["deck_id"],
                extracted_text=extracted_text[:1800],
            )
            update_generation_job(
                job_id,
                status="completed",
                stage="COMPLETED",
                progress=100,
                completed_chunks=completed_chunk_count,
                failed_chunks=chunk_errors,
            )
            final_upload_id = upload_id
            notify_upload_processing_result(
                current_user["user_id"],
                upload_id,
                status="completed",
                deck_id=deck["deck_id"],
            )
        else:
            upload_log_res = supabase.table("uploads").insert({
                "user_id": current_user["user_id"],
                "file_url": file_url,
                "file_name": body.file_name or "uploaded_doc.pdf",
                "file_type": body.file_type or "application/pdf",
                "processing_status": "completed",
                "processing_stage": "COMPLETED",
                "processing_progress": 100,
                "deck_id": deck["deck_id"],
                "extracted_text": sanitize_db_text(extracted_text)[:1800]
            }).execute()

            final_upload_id = None
            if upload_log_res.data:
                final_upload_id = upload_log_res.data[0].get("upload_id")

        log_ai_generation(
            current_user["user_id"],
            final_upload_id,
            f"PDF flashcards: {body.file_name or 'uploaded_doc.pdf'}",
            len(cards_res.data or []),
        )

        return {
            "success": True,
            "deck": deck,
            "cards": cards_res.data or [],
            "meta": {
                "textLength": len(extracted_text),
                "cardsGenerated": len(cards_res.data or []),
                "usage": usage_before_generation,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        capture_backend_exception(
            e,
            feature="upload",
            action="process_pdf_failed",
            tags={
                "user_id": current_user.get("user_id"),
            },
            extra={
                "file_url": body.file_url,
                "file_name": body.file_name,
                "file_type": body.file_type,
                "num_cards": body.num_cards,
            },
        )
        if upload_id:
            update_upload_job(
                upload_id,
                status="failed",
                stage="FAILED",
                progress=100,
                error_code="PROCESSING_FAILED",
                error_message="Document processing failed. Please try again later.",
            )
        print(f"Error processing PDF: {e}")
        raise HTTPException(status_code=500, detail="Document processing failed. Please try again later.")


@router.post("/process-notes")
def process_notes(
    body: NotesProcessBody,
    current_user: dict = Depends(get_current_user),
):
    require_flashcard_generation_access(current_user["user_id"])
    notes_content = body.notes
    
    if not notes_content or len(notes_content.strip()) < 10:
        raise HTTPException(status_code=400, detail="notes content must be at least 10 characters long")

    deck_title = generate_study_deck_title(
        source="notes",
        content=notes_content,
        source_title=body.title,
        fallback_title=body.title,
    )
    max_cards = body.num_cards or 10

    try:
        cards = generate_flashcards(notes_content, max_cards)
        
        if not isinstance(cards, list) or len(cards) == 0:
             raise HTTPException(status_code=500, detail="LLM returned no flashcards")

        deck_res = (
            supabase.table("decks")
            .insert({
                "user_id": current_user["user_id"],
                "title": deck_title,
                "description": "Auto-generated from Notes"
            })
            .execute()
        )
        
        if not deck_res.data:
            raise HTTPException(status_code=500, detail="Failed to create deck")
            
        deck = deck_res.data[0]
        
        card_rows = []
        for index, c in enumerate(cards):
            card_rows.append({
                "deck_id": deck["deck_id"],
                "question": c.get("question"),
                "answer": c.get("answer"),
                "explanation": c.get("explanation"),
                "card_order": index + 1
            })
            
        cards_res = (
            supabase.table("cards")
            .insert(card_rows)
            .execute()
        )
        for card in cards_res.data or []:
            create_initial_review_state(current_user["user_id"], deck["deck_id"], card["card_id"])

        consume_ai_generation_quota(current_user["user_id"], source="notes")

        return {
            "success": True,
            "deck": deck,
            "cards": cards_res.data or [],
            "meta": {
                "notesLength": len(notes_content),
                "cardsGenerated": len(cards_res.data or [])
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        capture_backend_exception(
            e,
            feature="notes_generation",
            action="process_notes_failed",
            tags={
                "user_id": current_user.get("user_id"),
            },
            extra={
                "title": body.title,
                "notes_length": len(body.notes or ""),
                "num_cards": body.num_cards,
            },
        )
        print(f"Error processing notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{upload_id}/content")
def get_upload_content(
    upload_id: str,
    current_user: dict = Depends(get_current_user),
):
    res = (
        supabase.table("uploads")
        .select("extracted_text, file_name")
        .eq("upload_id", upload_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Upload not found or access denied.")
    
    upload = res.data[0]
    return {
        "upload_id": upload_id,
        "file_name": upload.get("file_name"),
        "extracted_text": upload.get("extracted_text") or ""
    }
