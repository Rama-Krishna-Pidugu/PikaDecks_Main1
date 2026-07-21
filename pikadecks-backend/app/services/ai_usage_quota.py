import datetime
from typing import Any

from fastapi import HTTPException

from app.database import supabase
from app.observability import capture_backend_exception, log_structured_event
from app.services.billing import is_pro_user


FREE_AI_GENERATION_LIMIT = 10
AI_QUOTA_WINDOW_SECONDS = 24 * 60 * 60


def utcnow() -> datetime.datetime:
    return datetime.datetime.utcnow().replace(microsecond=0)


def _iso(value: datetime.datetime) -> str:
    return value.replace(microsecond=0).isoformat()


def _parse_quota_response(data: Any) -> dict[str, Any]:
    if isinstance(data, list):
        data = data[0] if data else None
    if not isinstance(data, dict):
        raise RuntimeError("Quota RPC returned an invalid response.")
    return data


def _pro_quota(user_id: str) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "used": 0,
        "usage_count": 0,
        "limit": None,
        "remaining": None,
        "unlimited": True,
        "plan": "pro",
        "resetsAt": None,
        "quota_reset_at": None,
        "windowSeconds": AI_QUOTA_WINDOW_SECONDS,
    }


def _normalize_free_quota(payload: dict[str, Any], user_id: str) -> dict[str, Any]:
    usage_count = int(payload.get("usage_count") or payload.get("used") or 0)
    limit = int(payload.get("limit") or FREE_AI_GENERATION_LIMIT)
    quota_reset_at = payload.get("quota_reset_at") or payload.get("resetsAt")
    return {
        "user_id": user_id,
        "used": usage_count,
        "usage_count": usage_count,
        "limit": limit,
        "remaining": max(0, limit - usage_count),
        "unlimited": False,
        "plan": "free",
        "resetsAt": quota_reset_at,
        "quota_reset_at": quota_reset_at,
        "windowSeconds": AI_QUOTA_WINDOW_SECONDS,
    }


def get_ai_generation_quota(user_id: str) -> dict[str, Any]:
    if is_pro_user(user_id):
        return _pro_quota(user_id)

    try:
        payload = _parse_quota_response(
            supabase.rpc(
                "get_ai_generation_quota",
                {
                    "p_user_id": user_id,
                    "p_limit": FREE_AI_GENERATION_LIMIT,
                    "p_window_seconds": AI_QUOTA_WINDOW_SECONDS,
                },
            ).execute().data
        )
        return _normalize_free_quota(payload, user_id)
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="ai_usage_quota",
            action="get_ai_generation_quota_failed",
            tags={"user_id": user_id},
        )
        raise HTTPException(status_code=502, detail="Could not load AI generation quota.") from exc


def consume_ai_generation_quota(user_id: str, *, source: str) -> dict[str, Any]:
    if is_pro_user(user_id):
        quota = _pro_quota(user_id)
        log_structured_event("ai_quota.premium_bypass", user_id=user_id, source=source)
        return quota

    try:
        payload = _parse_quota_response(
            supabase.rpc(
                "check_and_increment_ai_generation_quota",
                {
                    "p_user_id": user_id,
                    "p_limit": FREE_AI_GENERATION_LIMIT,
                    "p_window_seconds": AI_QUOTA_WINDOW_SECONDS,
                },
            ).execute().data
        )
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="ai_usage_quota",
            action="consume_ai_generation_quota_failed",
            tags={"user_id": user_id, "source": source},
        )
        raise HTTPException(status_code=502, detail="Could not reserve AI generation quota.") from exc

    quota = _normalize_free_quota(payload, user_id)
    allowed = bool(payload.get("allowed", quota["remaining"] >= 0))
    if not allowed:
        log_structured_event(
            "ai_quota.free_limit_reached",
            user_id=user_id,
            source=source,
            usage_count=quota["usage_count"],
            quota_reset_at=quota["quota_reset_at"],
        )
        raise HTTPException(
            status_code=429,
            detail={
                "code": "FREE_LIMIT_REACHED",
                "message": "You have used all 10 free AI generations for this 24-hour period. Please try again after the reset time or upgrade to Pro.",
                "usage": quota,
                "upgradeAvailable": True,
            },
        )

    log_structured_event(
        "ai_quota.free_generation_reserved",
        user_id=user_id,
        source=source,
        usage_count=quota["usage_count"],
        remaining=quota["remaining"],
        quota_reset_at=quota["quota_reset_at"],
    )
    return quota
