from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal, TypedDict
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.database import supabase


StreakStatus = Literal["ACTIVE", "FROZEN", "BROKEN"]


class StreakState(TypedDict):
    state: StreakStatus
    status: StreakStatus
    current_streak: int
    longest_streak: int
    last_study_date: str | None
    last_qualified_study_at: str | None
    grace_period_ends: str | None
    freeze_started_at: str | None
    freeze_expires_at: str | None
    restore_tokens: int
    restore_tokens_earned: int
    monthly_restores_remaining: int
    monthly_restore_limit: int | None
    shields_remaining: int | None
    shield_limit: int | None
    can_restore: bool
    can_use_shield: bool
    seconds_until_expiry: int | None
    protected_streak_value: int
    daily_goal: dict[str, Any]


@dataclass(frozen=True)
class StreakPlanConfig:
    monthly_restore_limit: int | None
    shield_limit: int | None


DAILY_GOAL = {
    "cards_required": 10,
    "minutes_required": 10,
    "mode": "cards_or_minutes",
}
GRACE_PERIOD_HOURS = 24
RESTORE_TOKEN_REVIEW_INTERVAL = 1000
PLAN_CONFIGS = {
    "free": StreakPlanConfig(monthly_restore_limit=1, shield_limit=0),
    "pro": StreakPlanConfig(monthly_restore_limit=5, shield_limit=5),
    "premium": StreakPlanConfig(monthly_restore_limit=5, shield_limit=5),
    "enterprise": StreakPlanConfig(monthly_restore_limit=None, shield_limit=None),
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _plan_config(plan_type: str | None) -> StreakPlanConfig:
    return PLAN_CONFIGS.get((plan_type or "free").lower(), PLAN_CONFIGS["free"])


def _zone(user_timezone: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(user_timezone or "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _local_date(at: datetime, user_timezone: str | None) -> date:
    return at.astimezone(_zone(user_timezone)).date()


def _end_of_local_day(local_day: date, user_timezone: str | None) -> datetime:
    z = _zone(user_timezone)
    end_local = datetime.combine(local_day, time(23, 59, 59), tzinfo=z)
    return end_local.astimezone(timezone.utc)


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _iso(value: datetime | None) -> str | None:
    return value.astimezone(timezone.utc).isoformat() if value else None


def _month_key(at: datetime) -> str:
    return at.strftime("%Y-%m")


def _select_streak(user_id: str) -> dict[str, Any] | None:
    res = supabase.table("user_streaks").select("*").eq("user_id", user_id).execute()
    return res.data[0] if res.data else None


def _insert_event(
    user_id: str,
    event_type: str,
    previous: dict[str, Any] | None,
    updated: dict[str, Any],
    metadata: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> None:
    previous = previous or {}
    supabase.table("streak_events").insert({
        "user_id": user_id,
        "event_type": event_type,
        "previous_status": previous.get("status") or previous.get("state"),
        "next_status": updated.get("status") or updated.get("state"),
        "previous_streak": previous.get("current_streak") or 0,
        "next_streak": updated.get("current_streak") or 0,
        "streak_value": updated.get("current_streak") or 0,
        "idempotency_key": idempotency_key,
        "metadata": metadata or {},
    }).execute()


def _ensure_streak(user_id: str, plan_type: str | None = "free") -> dict[str, Any]:
    existing = _select_streak(user_id)
    if existing:
        return existing

    now = _now()
    config = _plan_config(plan_type)
    monthly_restores = config.monthly_restore_limit if config.monthly_restore_limit is not None else 999999
    shields = config.shield_limit if config.shield_limit is not None else 999999
    row = {
        "user_id": user_id,
        "status": "BROKEN",
        "current_streak": 0,
        "longest_streak": 0,
        "protected_streak_value": 0,
        "restore_tokens_earned": 0,
        "restore_tokens_monthly": monthly_restores,
        "monthly_restore_count": 0,
        "last_refill_month": _month_key(now),
        "shield_count": shields,
        "last_shield_refill_month": _month_key(now),
        "total_study_days": 0,
        "created_at": _iso(now),
        "updated_at": _iso(now),
    }
    supabase.table("user_streaks").insert(row).execute()
    return _select_streak(user_id) or row


def refill_monthly_tokens(user_id: str, plan_type: str | None = "free") -> dict[str, Any]:
    now = _now()
    row = _ensure_streak(user_id, plan_type)
    config = _plan_config(plan_type)
    month = _month_key(now)
    updates: dict[str, Any] = {}

    if row.get("last_refill_month") != month:
        updates["restore_tokens_monthly"] = config.monthly_restore_limit if config.monthly_restore_limit is not None else 999999
        updates["monthly_restore_count"] = 0
        updates["last_refill_month"] = month

    if row.get("last_shield_refill_month") != month:
        updates["shield_count"] = config.shield_limit if config.shield_limit is not None else 999999
        updates["last_shield_refill_month"] = month

    if updates:
        updates["updated_at"] = _iso(now)
        supabase.table("user_streaks").update(updates).eq("user_id", user_id).execute()
        row = _select_streak(user_id) or {**row, **updates}

    return row


def _qualifies(cards_reviewed: int = 0, minutes_studied: float = 0) -> bool:
    mode = DAILY_GOAL["mode"]
    cards_ok = cards_reviewed >= DAILY_GOAL["cards_required"]
    minutes_ok = minutes_studied >= DAILY_GOAL["minutes_required"]
    if mode == "cards_and_minutes":
        return cards_ok and minutes_ok
    return cards_ok or minutes_ok


def _count_total_reviews(user_id: str) -> int:
    try:
        res = (
            supabase.table("review_history")
            .select("history_id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        if getattr(res, "count", None) is not None:
            return int(res.count or 0)
        return len(res.data or [])
    except Exception:
        return 0


def _can_auto_shield(row: dict[str, Any], plan_type: str | None, missed_day: date) -> bool:
    config = _plan_config(plan_type)
    if config.shield_limit == 0:
        return False
    if row.get("shield_used_for_local_date") == missed_day.isoformat():
        return False
    if config.shield_limit is None:
        return True
    return (row.get("shield_count") or 0) > 0


def _apply_shield(
    user_id: str,
    row: dict[str, Any],
    missed_day: date,
    user_timezone: str | None,
    plan_type: str | None,
) -> dict[str, Any]:
    now = _now()
    config = _plan_config(plan_type)
    shield_count = row.get("shield_count") or 0
    updates = {
        "status": "ACTIVE",
        "last_study_date": missed_day.isoformat(),
        "last_qualified_study_local_date": missed_day.isoformat(),
        "last_qualified_study_at": _iso(_end_of_local_day(missed_day, user_timezone)),
        "freeze_started_at": None,
        "freeze_expires_at": None,
        "broken_at": None,
        "shield_used_for_local_date": missed_day.isoformat(),
        "last_shield_used_at": _iso(now),
        "updated_at": _iso(now),
    }
    if config.shield_limit is not None:
        updates["shield_count"] = max(0, shield_count - 1)

    supabase.table("user_streaks").update(updates).eq("user_id", user_id).execute()
    updated = _select_streak(user_id) or {**row, **updates}
    _insert_event(
        user_id,
        "SHIELD_USED",
        row,
        updated,
        {"missed_local_date": missed_day.isoformat(), "plan_type": plan_type or "free"},
    )
    return updated


def _transition_for_time(
    user_id: str,
    row: dict[str, Any],
    user_timezone: str | None,
    plan_type: str | None,
) -> dict[str, Any]:
    now = _now()
    today = _local_date(now, user_timezone)
    yesterday = today - timedelta(days=1)
    last_study_date = _parse_date(row.get("last_qualified_study_local_date") or row.get("last_study_date"))
    status = row.get("status") or "ACTIVE"
    current_streak = row.get("current_streak") or 0

    if current_streak <= 0 and not last_study_date:
        if status != "BROKEN":
            updates = {"status": "BROKEN", "current_streak": 0, "updated_at": _iso(now)}
            supabase.table("user_streaks").update(updates).eq("user_id", user_id).execute()
            return _select_streak(user_id) or {**row, **updates}
        return row

    if last_study_date in (today, yesterday):
        if status != "ACTIVE":
            updates = {
                "status": "ACTIVE",
                "freeze_started_at": None,
                "freeze_expires_at": None,
                "broken_at": None,
                "updated_at": _iso(now),
            }
            supabase.table("user_streaks").update(updates).eq("user_id", user_id).execute()
            return _select_streak(user_id) or {**row, **updates}
        return row

    if status == "FROZEN":
        expires_at = _parse_datetime(row.get("freeze_expires_at"))
        if expires_at and now <= expires_at:
            return row

        updates = {
            "status": "BROKEN",
            "current_streak": 0,
            "broken_at": _iso(now),
            "updated_at": _iso(now),
        }
        supabase.table("user_streaks").update(updates).eq("user_id", user_id).execute()
        updated = _select_streak(user_id) or {**row, **updates}
        _insert_event(user_id, "STREAK_BROKEN", row, updated, {"reason": "freeze_expired"})
        return updated

    if status == "ACTIVE" and current_streak > 0:
        missed_day = yesterday
        if _can_auto_shield(row, plan_type, missed_day):
            return _apply_shield(user_id, row, missed_day, user_timezone, plan_type)

        freeze_expires_at = now + timedelta(hours=GRACE_PERIOD_HOURS)
        updates = {
            "status": "FROZEN",
            "protected_streak_value": current_streak,
            "freeze_started_at": _iso(now),
            "freeze_expires_at": _iso(freeze_expires_at),
            "updated_at": _iso(now),
        }
        supabase.table("user_streaks").update(updates).eq("user_id", user_id).execute()
        updated = _select_streak(user_id) or {**row, **updates}
        _insert_event(
            user_id,
            "STREAK_FROZEN",
            row,
            updated,
            {"grace_period_hours": GRACE_PERIOD_HOURS, "missed_local_date": missed_day.isoformat()},
        )
        return updated

    if status != "BROKEN":
        updates = {
            "status": "BROKEN",
            "current_streak": 0,
            "broken_at": _iso(now),
            "updated_at": _iso(now),
        }
        supabase.table("user_streaks").update(updates).eq("user_id", user_id).execute()
        updated = _select_streak(user_id) or {**row, **updates}
        _insert_event(user_id, "STREAK_BROKEN", row, updated, {"reason": "missed_grace_window"})
        return updated

    return row


def _serialize(row: dict[str, Any], plan_type: str | None) -> StreakState:
    now = _now()
    config = _plan_config(plan_type)
    status: StreakStatus = row.get("status") or row.get("state") or "BROKEN"
    freeze_expires_at = _parse_datetime(row.get("freeze_expires_at"))
    seconds_until_expiry = None
    if status == "FROZEN" and freeze_expires_at:
        seconds_until_expiry = max(0, int((freeze_expires_at - now).total_seconds()))

    earned = row.get("restore_tokens_earned") or 0
    monthly = row.get("restore_tokens_monthly") or 0
    shield_count = row.get("shield_count") or 0
    monthly_limit = config.monthly_restore_limit
    shield_limit = config.shield_limit

    return {
        "state": status,
        "status": status,
        "current_streak": row.get("current_streak") or 0,
        "longest_streak": row.get("longest_streak") or 0,
        "last_study_date": row.get("last_qualified_study_local_date") or row.get("last_study_date"),
        "last_qualified_study_at": row.get("last_qualified_study_at"),
        "grace_period_ends": row.get("freeze_expires_at"),
        "freeze_started_at": row.get("freeze_started_at"),
        "freeze_expires_at": row.get("freeze_expires_at"),
        "restore_tokens": earned + monthly,
        "restore_tokens_earned": earned,
        "monthly_restores_remaining": monthly,
        "monthly_restore_limit": monthly_limit,
        "shields_remaining": None if shield_limit is None else shield_count,
        "shield_limit": shield_limit,
        "can_restore": status in ("FROZEN", "BROKEN") and (earned + monthly) > 0,
        "can_use_shield": status == "ACTIVE" and (shield_limit is None or shield_count > 0),
        "seconds_until_expiry": seconds_until_expiry,
        "protected_streak_value": row.get("protected_streak_value") or row.get("current_streak") or 0,
        "daily_goal": DAILY_GOAL,
    }


def resolve_streak_state(
    user_id: str,
    user_timezone: str = "UTC",
    plan_type: str | None = "free",
) -> StreakState:
    row = refill_monthly_tokens(user_id, plan_type)
    row = _transition_for_time(user_id, row, user_timezone, plan_type)
    return _serialize(row, plan_type)


def process_meaningful_session(
    user_id: str,
    cards_reviewed_today: int,
    minutes_studied: float = 0,
    plan_type: str | None = "free",
    user_timezone: str = "UTC",
    idempotency_key: str | None = None,
) -> StreakState:
    if not _qualifies(cards_reviewed_today, minutes_studied):
        return resolve_streak_state(user_id, user_timezone, plan_type)

    now = _now()
    today = _local_date(now, user_timezone)
    row = refill_monthly_tokens(user_id, plan_type)
    row = _transition_for_time(user_id, row, user_timezone, plan_type)

    last_study_date = _parse_date(row.get("last_qualified_study_local_date") or row.get("last_study_date"))
    if last_study_date == today:
        return _serialize(row, plan_type)

    previous_status = row.get("status") or "BROKEN"
    current_streak = row.get("current_streak") or 0

    if previous_status == "ACTIVE" and last_study_date == today - timedelta(days=1):
        new_streak = current_streak + 1
        event_type = "STREAK_INCREMENTED"
    elif previous_status == "FROZEN":
        new_streak = (row.get("protected_streak_value") or current_streak) + 1
        event_type = "STREAK_RESTORED"
    else:
        new_streak = 1
        event_type = "STREAK_STARTED" if current_streak == 0 else "STREAK_BROKEN_RESTARTED"

    total_days = (row.get("total_study_days") or 0) + 1
    total_reviews = _count_total_reviews(user_id)
    earned_tokens = row.get("restore_tokens_earned") or 0
    previous_token_milestone = (row.get("earned_restore_token_milestone") or 0)
    next_token_milestone = total_reviews // RESTORE_TOKEN_REVIEW_INTERVAL
    token_earned = next_token_milestone > previous_token_milestone
    if token_earned:
        earned_tokens += next_token_milestone - previous_token_milestone

    updates = {
        "status": "ACTIVE",
        "current_streak": new_streak,
        "longest_streak": max(row.get("longest_streak") or 0, new_streak),
        "protected_streak_value": new_streak,
        "last_study_date": today.isoformat(),
        "last_qualified_study_local_date": today.isoformat(),
        "last_qualified_study_at": _iso(now),
        "freeze_started_at": None,
        "freeze_expires_at": None,
        "broken_at": None,
        "total_study_days": total_days,
        "restore_tokens_earned": earned_tokens,
        "earned_restore_token_milestone": next_token_milestone,
        "updated_at": _iso(now),
    }
    supabase.table("user_streaks").update(updates).eq("user_id", user_id).execute()
    updated = _select_streak(user_id) or {**row, **updates}
    _insert_event(
        user_id,
        event_type,
        row,
        updated,
        {
            "cards_reviewed_today": cards_reviewed_today,
            "minutes_studied": minutes_studied,
            "qualified_local_date": today.isoformat(),
        },
        idempotency_key=idempotency_key,
    )

    if token_earned:
        _insert_event(
            user_id,
            "RESTORE_TOKEN_EARNED",
            row,
            updated,
            {"total_reviews": total_reviews, "interval": RESTORE_TOKEN_REVIEW_INTERVAL},
        )

    return _serialize(updated, plan_type)


def restore_streak_with_token(
    user_id: str,
    plan_type: str | None = "free",
    user_timezone: str = "UTC",
    idempotency_key: str | None = None,
) -> StreakState:
    row = refill_monthly_tokens(user_id, plan_type)
    row = _transition_for_time(user_id, row, user_timezone, plan_type)
    state = _serialize(row, plan_type)
    if state["state"] not in ("FROZEN", "BROKEN"):
        raise ValueError("Streak does not need a restore.")
    if state["restore_tokens"] <= 0:
        raise ValueError("No restore tokens remaining.")

    now = _now()
    today = _local_date(now, user_timezone)
    earned = row.get("restore_tokens_earned") or 0
    monthly = row.get("restore_tokens_monthly") or 0
    restored_value = row.get("protected_streak_value") or row.get("current_streak") or 1
    token_type = "monthly" if monthly > 0 else "earned"

    updates = {
        "status": "ACTIVE",
        "current_streak": restored_value,
        "longest_streak": max(row.get("longest_streak") or 0, restored_value),
        "last_study_date": today.isoformat(),
        "last_qualified_study_local_date": today.isoformat(),
        "last_qualified_study_at": _iso(now),
        "freeze_started_at": None,
        "freeze_expires_at": None,
        "broken_at": None,
        "last_restore_at": _iso(now),
        "monthly_restore_count": (row.get("monthly_restore_count") or 0) + (1 if monthly > 0 else 0),
        "updated_at": _iso(now),
    }
    if monthly > 0:
        updates["restore_tokens_monthly"] = monthly - 1
    else:
        updates["restore_tokens_earned"] = max(0, earned - 1)

    supabase.table("user_streaks").update(updates).eq("user_id", user_id).execute()
    updated = _select_streak(user_id) or {**row, **updates}
    _insert_event(
        user_id,
        "RESTORE_USED",
        row,
        updated,
        {"token_type": token_type},
        idempotency_key=idempotency_key,
    )
    return _serialize(updated, plan_type)
