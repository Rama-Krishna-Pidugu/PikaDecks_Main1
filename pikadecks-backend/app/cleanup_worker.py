import datetime
import os
from typing import Any

import boto3

from app.database import supabase
from app.observability import capture_backend_exception, init_sentry
from app.runtime_config import load_runtime_config
from app.services.file_cleanup import is_missing_cleanup_table_error


load_runtime_config()
init_sentry()


def _aws_region() -> str:
    return os.getenv("AWS_REGION") or os.getenv("PIKA_AWS_REGION") or "ap-south-1"


def _delete_s3_object(bucket: str | None, key: str | None) -> None:
    if not bucket or not key:
        raise ValueError("Missing S3 bucket or key")

    boto3.client("s3", region_name=_aws_region()).delete_object(Bucket=bucket, Key=key)


def _mark_cleanup_job(job_id: str, status: str, error_message: str | None = None) -> None:
    payload: dict[str, Any] = {
        "status": status,
        "processed_at": datetime.datetime.utcnow().isoformat(),
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }
    if error_message:
        payload["error_message"] = error_message[:1000]
    supabase.table("file_cleanup_jobs").update(payload).eq("cleanup_job_id", job_id).execute()


def process_due_file_cleanup(limit: int = 100) -> dict[str, int]:
    now = datetime.datetime.utcnow().isoformat()
    try:
        jobs = (
            supabase.table("file_cleanup_jobs")
            .select("*")
            .eq("status", "pending")
            .lte("delete_after", now)
            .limit(limit)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if is_missing_cleanup_table_error(exc):
            print(
                "[WARNING] file_cleanup_jobs table is missing; "
                "run migrations/20260605_deferred_data_cleanup.sql to enable deferred file deletion."
            )
            return {"deleted": 0, "failed": 0, "skipped": 0, "migration_missing": 1}
        raise

    deleted = 0
    failed = 0
    skipped = 0

    for job in jobs:
        try:
            provider = job.get("storage_provider")
            if provider == "s3":
                _delete_s3_object(job.get("storage_bucket") or os.getenv("S3_BUCKET"), job.get("storage_key"))
                deleted += 1
                status = "deleted"
            else:
                skipped += 1
                status = "skipped"

            _mark_cleanup_job(job["cleanup_job_id"], status)
            if job.get("upload_id"):
                supabase.table("uploads").update({
                    "cleanup_status": status,
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                }).eq("upload_id", job["upload_id"]).execute()
        except Exception as exc:
            failed += 1
            _mark_cleanup_job(job["cleanup_job_id"], "failed", str(exc))
            capture_backend_exception(
                exc,
                feature="cleanup",
                action="delete_file_cleanup_job_failed",
                tags={
                    "cleanup_job_id": job.get("cleanup_job_id"),
                    "upload_id": job.get("upload_id"),
                    "provider": job.get("storage_provider"),
                },
            )

    return {"deleted": deleted, "failed": failed, "skipped": skipped}


def _cleanup_user_data(user_id: str) -> None:
    # 1. Delete user card progress
    try:
        supabase.table("user_card_progress").delete().eq("user_id", user_id).execute()
    except Exception:
        pass
    try:
        supabase.table("usercardprogress").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 2. Delete reviews
    try:
        supabase.table("reviews").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 3. Delete review history
    try:
        supabase.table("review_history").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 4. Delete cards under user's decks
    try:
        decks_res = supabase.table("decks").select("deck_id").eq("user_id", user_id).execute()
        deck_ids = [d["deck_id"] for d in (decks_res.data or [])]
        if deck_ids:
            for deck_id in deck_ids:
                try:
                    supabase.table("cards").delete().eq("deck_id", deck_id).execute()
                except Exception:
                    pass
    except Exception:
        pass

    # 5. Delete decks
    try:
        supabase.table("decks").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 6. Delete uploads
    try:
        supabase.table("uploads").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 7. Delete push tokens
    try:
        supabase.table("user_push_tokens").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 8. Delete notification settings
    try:
        supabase.table("notification_settings").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 9. Delete notification logs
    try:
        supabase.table("notification_logs").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 10. Delete achievements
    try:
        supabase.table("user_achievements").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 11. Delete streak state and audit history
    try:
        supabase.table("streak_events").delete().eq("user_id", user_id).execute()
    except Exception:
        pass
    try:
        supabase.table("study_sessions").delete().eq("user_id", user_id).execute()
    except Exception:
        pass
    try:
        supabase.table("user_streaks").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 12. Delete stats
    try:
        supabase.table("user_stats").delete().eq("user_id", user_id).execute()
    except Exception:
        pass
    try:
        supabase.table("userstats").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 13. Delete quotas
    try:
        supabase.table("user_ai_usage_quotas").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 14. Delete generation cache
    try:
        supabase.table("user_generation_cache").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 15. Delete text extraction cache
    try:
        supabase.table("text_extraction_cache").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 16. Delete provider usage events
    try:
        supabase.table("provider_usage_events").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 17. Delete youtube generations
    try:
        supabase.table("youtube_generations").delete().eq("user_id", user_id).execute()
    except Exception:
        pass

    # 18. Delete generation jobs & related
    try:
        jobs_res = supabase.table("generation_jobs").select("job_id").eq("user_id", user_id).execute()
        job_ids = [j["job_id"] for j in (jobs_res.data or [])]
        if job_ids:
            for job_id in job_ids:
                try:
                    supabase.table("generation_chunks").delete().eq("job_id", job_id).execute()
                except Exception:
                    pass
                try:
                    supabase.table("chunk_summaries").delete().eq("job_id", job_id).execute()
                except Exception:
                    pass
                try:
                    supabase.table("extracted_concepts").delete().eq("job_id", job_id).execute()
                except Exception:
                    pass
                try:
                    supabase.table("generated_cards").delete().eq("job_id", job_id).execute()
                except Exception:
                    pass
                try:
                    supabase.table("processing_events").delete().eq("job_id", job_id).execute()
                except Exception:
                    pass
            try:
                supabase.table("generation_jobs").delete().eq("user_id", user_id).execute()
            except Exception:
                pass
    except Exception:
        pass

    # 19. Delete billing subscriptions
    try:
        supabase.table("user_subscriptions").delete().eq("user_id", user_id).execute()
    except Exception:
        pass


def purge_due_users(limit: int = 50) -> dict[str, int]:
    now = datetime.datetime.utcnow().isoformat()
    users = (
        supabase.table("users")
        .select("user_id")
        .eq("is_deleted", True)
        .lte("scheduled_deletion_at", now)
        .limit(limit)
        .execute()
        .data
        or []
    )

    purged = 0
    blocked = 0
    failed = 0

    for user in users:
        user_id = user["user_id"]
        try:
            try:
                pending_files = (
                    supabase.table("file_cleanup_jobs")
                    .select("cleanup_job_id")
                    .eq("user_id", user_id)
                    .eq("reason", "account_deletion")
                    .in_("status", ["pending", "failed"])
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
            except Exception as exc:
                if is_missing_cleanup_table_error(exc):
                    pending_files = []
                else:
                    raise
            if pending_files:
                blocked += 1
                continue

            # Manually purge all child table data
            _cleanup_user_data(user_id)

            # Delete the main user row
            supabase.table("users").delete().eq("user_id", user_id).execute()
            purged += 1
        except Exception as exc:
            failed += 1
            capture_backend_exception(
                exc,
                feature="cleanup",
                action="purge_due_user_failed",
                tags={"user_id": user_id},
            )

    return {"purged": purged, "blocked": blocked, "failed": failed}


def handler(event, context):
    file_result = process_due_file_cleanup()
    user_result = purge_due_users()
    return {
        "statusCode": 200,
        "file_cleanup": file_result,
        "user_purge": user_result,
    }
