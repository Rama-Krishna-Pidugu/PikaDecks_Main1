import datetime
import json
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.database import supabase
from app.models.youtube import YouTubeGenerateBody
from app.observability import capture_backend_exception
from app.services.entitlements import require_youtube_generation_access
from app.services.get_current_user import get_current_user
from app.services.youtube_transcripts import normalize_youtube_url, get_video_id, fetch_transcript


router = APIRouter(prefix="/youtube", tags=["youtube"])


USER_SAFE_YOUTUBE_ERRORS = {
    "INVALID_YOUTUBE_URL": "Please enter a valid YouTube URL or video ID.",
    "TRANSCRIPT_DISABLED": "Transcripts are disabled for this video.",
    "TRANSCRIPT_UNAVAILABLE": "We could not find a transcript for this video.",
    "VIDEO_UNAVAILABLE": "This video is unavailable or does not exist.",
    "EMPTY_TRANSCRIPT": "The transcript is too short to create flashcards.",
    "AI_RATE_LIMITED": "AI generation is temporarily busy. Please try again later.",
    "AI_GENERATION_FAILED": "AI generation failed for this video. Please try another video or fewer cards.",
    "NO_VALID_CARDS": "We could not create useful flashcards from this video.",
    "DATABASE_FAILED": "We generated your content but could not save it. Please try again later.",
    "QUEUE_FAILED": "We could not start background processing. Please try again later.",
    "WORKER_FAILED": "Background processing stopped unexpectedly. Please try again later.",
}


def _queue_url() -> str | None:
    return os.getenv("YOUTUBE_PROCESSING_QUEUE_URL")


def _aws_region() -> str:
    return os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "ap-south-1"


def update_youtube_generation(
    generation_id: str,
    *,
    status: str | None = None,
    stage: str | None = None,
    progress: int | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    deck_id: str | None = None,
    cards_generated: int | None = None,
    provider_used: str | None = None,
    transcript_length: int | None = None,
    video_id: str | None = None,
    transcript_hash: str | None = None,
    provider_call_count: int | None = None,
    summary_call_count: int | None = None,
    card_call_count: int | None = None,
    generation_duration_ms: int | None = None,
):
    payload: dict = {"updated_at": datetime.datetime.utcnow().isoformat()}
    if status is not None:
        payload["generation_status"] = status
    if stage is not None:
        payload["processing_stage"] = stage
    if progress is not None:
        payload["processing_progress"] = max(0, min(100, progress))
    if error_code is not None:
        payload["error_code"] = error_code
    if error_message is not None:
        payload["error_message"] = error_message
    if deck_id is not None:
        payload["deck_id"] = deck_id
    if cards_generated is not None:
        payload["cards_generated"] = cards_generated
    if provider_used is not None:
        payload["provider_used"] = provider_used
    if transcript_length is not None:
        payload["transcript_length"] = transcript_length
    if video_id is not None:
        payload["video_id"] = video_id
    if transcript_hash is not None:
        payload["transcript_hash"] = transcript_hash
    if provider_call_count is not None:
        payload["provider_call_count"] = provider_call_count
    if summary_call_count is not None:
        payload["summary_call_count"] = summary_call_count
    if card_call_count is not None:
        payload["card_call_count"] = card_call_count
    if generation_duration_ms is not None:
        payload["generation_duration_ms"] = generation_duration_ms
    if status in {"completed", "failed"}:
        payload["completed_at"] = datetime.datetime.utcnow().isoformat()

    return supabase.table("youtube_generations").update(payload).eq("generation_id", generation_id).execute()


def enqueue_youtube_generation(generation_id: str, user_id: str):
    queue_url = _queue_url()
    if not queue_url:
        raise RuntimeError("YOUTUBE_PROCESSING_QUEUE_URL is not configured")

    import boto3

    boto3.client("sqs", region_name=_aws_region()).send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps({"generation_id": generation_id, "user_id": user_id}),
    )


@router.post("/generate")
def generate_youtube_flashcards(
    body: YouTubeGenerateBody,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    require_youtube_generation_access(current_user["user_id"])
    youtube_url = normalize_youtube_url(body.url)
    if not youtube_url:
        raise HTTPException(status_code=400, detail={
            "code": "INVALID_YOUTUBE_URL",
            "message": USER_SAFE_YOUTUBE_ERRORS["INVALID_YOUTUBE_URL"],
        })
    video_id = get_video_id(youtube_url)

    requested_cards = max(5, min(body.num_cards or 10, 30))
    generation_res = supabase.table("youtube_generations").insert({
        "user_id": current_user["user_id"],
        "youtube_url": youtube_url,
        "video_id": video_id,
        "requested_cards": requested_cards,
        "title": body.title,
        "languages": body.languages or ["en"],
        "generation_status": "queued",
        "processing_stage": "QUEUED",
        "processing_progress": 0,
    }).execute()
    if not generation_res.data:
        raise HTTPException(status_code=502, detail={
            "code": "DATABASE_FAILED",
            "message": USER_SAFE_YOUTUBE_ERRORS["DATABASE_FAILED"],
        })

    generation = generation_res.data[0]
    generation_id = generation["generation_id"]
    try:
        if _queue_url():
            enqueue_youtube_generation(generation_id, current_user["user_id"])
        elif os.getenv("LOCAL_ASYNC_FALLBACK", "true").strip().lower() in {"1", "true", "yes", "on"}:
            from app.pipeline_workers import process_youtube_generation

            background_tasks.add_task(
                process_youtube_generation,
                {"generation_id": generation_id, "user_id": current_user["user_id"]},
            )
        else:
            raise RuntimeError("YOUTUBE_PROCESSING_QUEUE_URL is not configured")
    except Exception as exc:
        update_youtube_generation(
            generation_id,
            status="failed",
            stage="FAILED",
            progress=100,
            error_code="QUEUE_FAILED",
            error_message=USER_SAFE_YOUTUBE_ERRORS["QUEUE_FAILED"],
        )
        capture_backend_exception(
            exc,
            feature="youtube_generation",
            action="enqueue_youtube_generation_failed",
            tags={"user_id": current_user.get("user_id"), "generation_id": generation_id, "video_id": video_id},
        )
        raise HTTPException(status_code=502, detail={
            "code": "QUEUE_FAILED",
            "message": USER_SAFE_YOUTUBE_ERRORS["QUEUE_FAILED"],
        })

    return {
        "success": True,
        "generation_id": generation_id,
        "status": "queued",
    }


@router.get("/generation/{generation_id}")
def get_youtube_generation(
    generation_id: str,
    current_user: dict = Depends(get_current_user),
):
    rows = (
        supabase.table("youtube_generations")
        .select("*")
        .eq("generation_id", generation_id)
        .eq("user_id", current_user["user_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="YouTube generation not found.")

    generation = rows[0]
    error = None
    if generation.get("error_code"):
        error = {
            "code": generation.get("error_code"),
            "message": generation.get("error_message") or USER_SAFE_YOUTUBE_ERRORS.get(generation.get("error_code"), "Generation failed."),
        }

    return {
        "generation_id": generation["generation_id"],
        "status": generation.get("generation_status"),
        "stage": generation.get("processing_stage"),
        "progress": generation.get("processing_progress") or 0,
        "deck_id": generation.get("deck_id"),
        "cards_generated": generation.get("cards_generated") or 0,
        "video_id": generation.get("video_id"),
        "transcript_length": generation.get("transcript_length") or 0,
        "provider_used": generation.get("provider_used"),
        "generation_duration_ms": generation.get("generation_duration_ms"),
        "provider_call_count": generation.get("provider_call_count") or 0,
        "summary_call_count": generation.get("summary_call_count") or 0,
        "card_call_count": generation.get("card_call_count") or 0,
        "error": error,
        "created_at": generation.get("created_at"),
        "completed_at": generation.get("completed_at"),
    }


@router.get("/transcript")
def get_youtube_transcript(
    url: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        result = fetch_transcript(url)
        return {
            "video_id": result.video_id,
            "language": result.language,
            "transcript": result.transcript,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/generation/{generation_id}/abort")
def abort_youtube_generation(
    generation_id: str,
    current_user: dict = Depends(get_current_user),
):
    rows = (
        supabase.table("youtube_generations")
        .select("*")
        .eq("generation_id", generation_id)
        .eq("user_id", current_user["user_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="YouTube generation job not found.")

    gen = rows[0]
    if gen.get("deck_id") or gen.get("generation_status") == "completed":
        raise HTTPException(status_code=409, detail="This generation has already completed.")

    update_youtube_generation(
        generation_id,
        status="cancelled",
        stage="CANCELLED",
        progress=100,
        error_code="USER_ABORTED",
        error_message="Generation cancelled by the user."
    )

    return {
        "success": True,
        "generation_id": generation_id,
        "status": "CANCELLED",
        "message": "Generation cancelled by the user."
    }

