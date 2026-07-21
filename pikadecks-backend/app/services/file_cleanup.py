import datetime
import os
from urllib.parse import urlparse

from app.database import supabase
from app.observability import capture_backend_exception


RETENTION_DAYS = int(os.getenv("DEFERRED_DELETE_RETENTION_DAYS", "14"))


def delete_after(days: int = RETENTION_DAYS) -> datetime.datetime:
    return datetime.datetime.utcnow() + datetime.timedelta(days=days)


def extract_s3_key(file_url: str | None) -> tuple[str | None, str | None, str]:
    if not file_url:
        return None, None, "unknown"

    parsed = urlparse(file_url)
    host = parsed.netloc
    path = parsed.path.lstrip("/")

    if "amazonaws.com" in host:
        bucket = host.split(".s3.")[0] if ".s3." in host else os.getenv("S3_BUCKET")
        return bucket, path, "s3"

    if "/storage/v1/object/" in file_url:
        return None, path, "supabase"

    return None, path or None, "unknown"


def is_missing_cleanup_table_error(exc: Exception) -> bool:
    message = str(exc)
    return "file_cleanup_jobs" in message and ("PGRST205" in message or "Could not find the table" in message)


def schedule_upload_file_cleanup(
    *,
    upload_id: str,
    user_id: str | None,
    file_url: str | None,
    reason: str,
    retention_days: int = RETENTION_DAYS,
) -> None:
    if not upload_id or not file_url:
        return

    due_at = delete_after(retention_days)
    bucket, key, provider = extract_s3_key(file_url)
    now = datetime.datetime.utcnow().isoformat()

    try:
        supabase.table("uploads").update({
            "cleanup_status": "pending",
            "cleanup_reason": reason,
            "cleanup_requested_at": now,
            "delete_after": due_at.isoformat(),
            "updated_at": now,
        }).eq("upload_id", upload_id).execute()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="cleanup",
            action="mark_upload_cleanup_pending_failed",
            tags={"upload_id": upload_id, "reason": reason},
        )

    try:
        supabase.table("file_cleanup_jobs").upsert({
            "upload_id": upload_id,
            "user_id": user_id,
            "file_url": file_url,
            "storage_provider": provider,
            "storage_bucket": bucket,
            "storage_key": key,
            "reason": reason,
            "status": "pending",
            "delete_after": due_at.isoformat(),
            "updated_at": now,
        }, on_conflict="upload_id,reason").execute()
    except Exception as exc:
        if is_missing_cleanup_table_error(exc):
            print(
                "[WARNING] file_cleanup_jobs table is missing; "
                "run migrations/20260605_deferred_data_cleanup.sql to enable deferred file deletion."
            )
            return
        capture_backend_exception(
            exc,
            feature="cleanup",
            action="schedule_upload_file_cleanup_failed",
            tags={"upload_id": upload_id, "reason": reason},
        )
