import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException

from app.database import supabase
from app.services.ai_usage_quota import consume_ai_generation_quota, get_ai_generation_quota
from app.services.billing import is_pro_user


FREE_DAILY_PDF_GENERATIONS = 10
FREE_DAILY_YOUTUBE_GENERATIONS = 3
FREE_DAILY_FLASHCARD_GENERATIONS = 10
FREE_MAX_PDF_PAGES = 150
FREE_MAX_ACTIVE_PDF_JOBS = 2


def get_user_plan(user_id: str) -> str:
    if is_pro_user(user_id):
        return "pro"
        
    # Fallback: check if they were manually granted pro via denormalized column
    # or if their subscription desynced
    user_rows = supabase.table("users").select("plan_type").eq("user_id", user_id).limit(1).execute().data
    if user_rows and user_rows[0].get("plan_type") == "pro":
        return "pro"
        
    return "free"


def has_pro_access(user_id: str) -> bool:
    return get_user_plan(user_id) == "pro"


def _day_bounds(timezone_name: str | None = None) -> tuple[str, str]:
    if timezone_name:
        try:
            user_timezone = ZoneInfo(timezone_name)
            now_local = datetime.datetime.now(datetime.timezone.utc).astimezone(user_timezone)
            start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
            end_local = start_local + datetime.timedelta(days=1)
            start = start_local.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            end = end_local.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            return start.isoformat(), end.isoformat()
        except ZoneInfoNotFoundError:
            pass

    now = datetime.datetime.utcnow()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + datetime.timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _count_today(table_name: str, user_id: str, created_column: str = "created_at") -> int:
    start, end = _day_bounds()
    rows = (
        supabase.table(table_name)
        .select("*")
        .eq("user_id", user_id)
        .gte(created_column, start)
        .lt(created_column, end)
        .execute()
        .data
        or []
    )
    return len(rows)


def _count_completed_pdf_generations_today(user_id: str, timezone_name: str | None = None) -> int:
    start, end = _day_bounds(timezone_name)
    rows = (
        supabase.table("ai_generations")
        .select("generation_id,upload_id,prompt_used")
        .eq("user_id", user_id)
        .eq("generation_status", "completed")
        .gte("created_at", start)
        .lt("created_at", end)
        .execute()
        .data
        or []
    )
    return len([
        row for row in rows
        if row.get("upload_id") or str(row.get("prompt_used") or "").lower().startswith("pdf ")
    ])


def _count_active_pdf_jobs(user_id: str) -> int:
    rows = (
        supabase.table("uploads")
        .select("upload_id")
        .eq("user_id", user_id)
        .in_("processing_status", ["pending", "processing"])
        .execute()
        .data
        or []
    )
    return len(rows)


def require_pdf_generation_access(
    user_id: str,
    *,
    page_count: int | None = None,
    timezone_name: str | None = None,
    consume_quota: bool = True,
) -> str:
    plan = get_user_plan(user_id)
    if page_count is not None and page_count > FREE_MAX_PDF_PAGES:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "PREMIUM_REQUIRED",
                "message": (
                    f"Large PDF detected. This document contains {page_count} pages. "
                    f"Free plan supports PDFs up to {FREE_MAX_PDF_PAGES} pages. Upgrade to Pro for unlimited PDF processing."
                ),
            },
        )
    if plan == "pro":
        return plan
    if _count_active_pdf_jobs(user_id) >= FREE_MAX_ACTIVE_PDF_JOBS:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "FREE_ACTIVE_JOB_LIMIT_REACHED",
                "message": "You already have PDF generations running. Please wait for one to finish before starting another.",
            },
        )
    if consume_quota:
        quota = get_ai_generation_quota(user_id)
        if not quota.get("unlimited") and quota.get("remaining", 0) <= 0:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "FREE_LIMIT_REACHED",
                    "message": "You have used all 10 free AI generations for this 24-hour period. Please try again after the reset time or upgrade to Pro.",
                    "usage": quota,
                    "upgradeAvailable": True,
                },
            )
    return plan


def require_youtube_generation_access(user_id: str) -> str:
    plan = get_user_plan(user_id)
    if plan == "pro":
        return plan
    quota = get_ai_generation_quota(user_id)
    if not quota.get("unlimited") and quota.get("remaining", 0) <= 0:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "FREE_LIMIT_REACHED",
                "message": "You have used all 10 free AI generations for this 24-hour period. Please try again after the reset time or upgrade to Pro.",
                "usage": quota,
                "upgradeAvailable": True,
            },
        )
    return plan


def require_flashcard_generation_access(user_id: str) -> str:
    plan = get_user_plan(user_id)
    if plan == "pro":
        return plan
    quota = get_ai_generation_quota(user_id)
    if not quota.get("unlimited") and quota.get("remaining", 0) <= 0:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "FREE_LIMIT_REACHED",
                "message": "You have used all 10 free AI generations for this 24-hour period. Please try again after the reset time or upgrade to Pro.",
                "usage": quota,
                "upgradeAvailable": True,
            },
        )
    return plan
