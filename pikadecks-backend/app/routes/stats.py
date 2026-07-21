from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.database import supabase
from app.services.get_current_user import get_current_user
from app.services.srs import get_review_overview
from app.services.streak_resolver import (
    refill_monthly_tokens,
    resolve_streak_state,
    restore_streak_with_token,
)

router = APIRouter(tags=["stats"])


def parse_date_robust(date_str: str | None) -> datetime | None:
    """Parse postgresql date string robustly, handling different separators and formats."""
    if not date_str:
        return None
    try:
        clean_str = date_str.replace(" ", "T")
        if "+" in clean_str:
            clean_str = clean_str.split("+")[0]
        if "Z" in clean_str:
            clean_str = clean_str.replace("Z", "")
        if "." in clean_str:
            clean_str = clean_str.split(".")[0]
        return datetime.fromisoformat(clean_str)
    except Exception as e:
        print(f"Error parsing date {date_str}: {e}")
        return None


@router.get("/stats")
def get_stats(current_user: dict = Depends(get_current_user)):
    """
    Compute study statistics from review_history + user_stats robustly.
    """
    user_id = current_user["user_id"]
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)

    all_reviews_resp = (
        supabase.table("review_history")
        .select("reviewed_at")
        .eq("user_id", user_id)
        .order("reviewed_at", desc=True)
        .execute()
    )
    all_reviews = all_reviews_resp.data or []

    cards_reviewed_total = len(all_reviews)
    cards_reviewed_today = 0
    study_dates: set[str] = set()

    for r in all_reviews:
        reviewed_at_str = r.get("reviewed_at")
        reviewed_at = parse_date_robust(reviewed_at_str)
        if reviewed_at:
            if reviewed_at >= today_start:
                cards_reviewed_today += 1
            study_dates.add(reviewed_at.strftime("%Y-%m-%d"))

    study_days = len(study_dates)

    current_streak = 0
    longest_streak = 0

    if study_dates:
        sorted_dates = sorted(list(study_dates), reverse=True)
        today_str = now.strftime("%Y-%m-%d")
        yesterday_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")

        if sorted_dates[0] in (today_str, yesterday_str):
            streak = 1
            check_date = datetime.strptime(sorted_dates[0], "%Y-%m-%d")
            while True:
                prev_day = (check_date - timedelta(days=1)).strftime("%Y-%m-%d")
                if prev_day in study_dates:
                    streak += 1
                    check_date = check_date - timedelta(days=1)
                else:
                    break
            current_streak = streak

        all_sorted = sorted(list(study_dates))
        best = 1
        run = 1
        for i in range(1, len(all_sorted)):
            prev = datetime.strptime(all_sorted[i - 1], "%Y-%m-%d")
            curr = datetime.strptime(all_sorted[i], "%Y-%m-%d")
            if (curr - prev).days == 1:
                run += 1
                best = max(best, run)
            else:
                run = 1
        longest_streak = best if study_dates else 0

    weekly = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        count = 0
        for r in all_reviews:
            reviewed_at_str = r.get("reviewed_at")
            reviewed_at = parse_date_robust(reviewed_at_str)
            if reviewed_at and reviewed_at.strftime("%Y-%m-%d") == day:
                count += 1
        weekly.append(count)

    stats_row = (
        supabase.table("user_stats")
        .select("stat_id")
        .eq("user_id", user_id)
        .execute()
    )

    # Only write non-streak stats to user_stats.
    # current_streak and longest_streak are owned by user_streaks after the migration.
    stats_payload = {
        "cards_reviewed": cards_reviewed_total,
        "study_days": study_days,
    }

    if stats_row.data:
        supabase.table("user_stats").update(stats_payload).eq("user_id", user_id).execute()
    else:
        stats_payload["user_id"] = user_id
        supabase.table("user_stats").insert(stats_payload).execute()

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "cards_reviewed_today": cards_reviewed_today,
        "cards_reviewed_total": cards_reviewed_total,
        "study_days": study_days,
        "weekly": weekly,
        **get_review_overview(user_id),
    }


@router.get("/study/stats")
def get_study_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    # Read non-streak fields from user_stats
    stats_res = supabase.table("user_stats").select("cards_reviewed,study_days").eq("user_id", user_id).execute()
    stats_data = stats_res.data[0] if stats_res.data else {
        "study_days": 0,
    }
    cards_reviewed = stats_data.get("cards_reviewed") or 0
    hours_studied = round(cards_reviewed * 0.15 / 60.0, 2)

    # Read longest_streak from user_streaks (source of truth after migration)
    streaks_res = supabase.table("user_streaks").select("longest_streak").eq("user_id", user_id).execute()
    streaks_data = streaks_res.data[0] if streaks_res.data else {"longest_streak": 0}

    return {
        "current_streak": 0,  # Use /streak endpoint for live current streak
        "longest_streak": streaks_data.get("longest_streak") or 0,
        "total_study_days": stats_data.get("study_days") or 0,
        "cards_reviewed": cards_reviewed,
        "hours_studied": hours_studied,
    }


@router.get("/study/streak")
def get_study_streak(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    plan = current_user.get("plan_type") or current_user.get("plan") or "free"
    user_timezone = current_user.get("timezone") or current_user.get("user_timezone") or "UTC"

    # 1. Lazy Refill Tokens
    refill_monthly_tokens(user_id, plan)

    # 2. Resolve State
    streak_data = resolve_streak_state(user_id, user_timezone=user_timezone, plan_type=plan)

    # 3. Milestones
    current_streak = streak_data["current_streak"]
    milestones = [
        {"days": 7, "reached": current_streak >= 7, "name": "7 Day Explorer"},
        {"days": 14, "reached": current_streak >= 14, "name": "14 Day Challenger"},
        {"days": 30, "reached": current_streak >= 30, "name": "30 Day Consistency Master"},
        {"days": 50, "reached": current_streak >= 50, "name": "50 Day Habit Specialist"},
        {"days": 100, "reached": current_streak >= 100, "name": "100 Day Memory Legend"},
        {"days": 365, "reached": current_streak >= 365, "name": "365 Day Ultimate Master"},
    ]

    return {
        **streak_data,
        "total_study_days": supabase.table("user_streaks").select("total_study_days").eq("user_id", user_id).single().execute().data.get("total_study_days", 0),
        "milestones": milestones,
    }


@router.get("/streak")
def get_streak(current_user: dict = Depends(get_current_user)):
    return get_study_streak(current_user)


@router.get("/study/review-progress")
def get_review_progress(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    overview = get_review_overview(user_id)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)

    history_res = (
        supabase.table("review_history")
        .select("history_id")
        .eq("user_id", user_id)
        .gte("reviewed_at", today_start.isoformat())
        .execute()
    )
    completed_today = len(history_res.data or [])

    # due_today = Due + Overdue cards (review_count >= 3, reviewed >= 1 day ago)
    due_today = overview.get("due_today") or 0

    # Also include New cards (review_count < 3) in the daily goal
    decks_breakdown = overview.get("decks_breakdown") or {}
    new_cards = sum((db.get("new") or 0) for db in decks_breakdown.values())

    # Total goal = due/overdue + new cards
    total_goal = due_today + new_cards

    # Remaining = total goal minus cards already reviewed today (floor at 0)
    remaining = max(0, total_goal - completed_today)
    total_reviews = completed_today + remaining

    completion_percentage = 100
    if total_reviews > 0:
        completion_percentage = round((completed_today / total_reviews) * 100)

    return {
        "reviews_due_today": total_goal,
        "reviews_completed_today": completed_today,
        "remaining_reviews": remaining,
        "completion_percentage": completion_percentage,
    }



class RestoreRequest(BaseModel):
    pass

@router.post("/study/streak/restore")
def restore_streak(
    request: RestoreRequest = None,
    current_user: dict = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    user_id = current_user["user_id"]
    plan = current_user.get("plan_type") or current_user.get("plan") or "free"
    user_timezone = current_user.get("timezone") or current_user.get("user_timezone") or "UTC"
    try:
        streak = restore_streak_with_token(
            user_id,
            plan_type=plan,
            user_timezone=user_timezone,
            idempotency_key=idempotency_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"success": True, "message": "Streak restored!", **streak}


@router.post("/streak/restore")
def restore_streak_alias(
    request: RestoreRequest = None,
    current_user: dict = Depends(get_current_user),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    return restore_streak(request, current_user, idempotency_key)


@router.get("/streak/history")
def get_streak_history(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    res = (
        supabase.table("streak_events")
        .select("event_id,event_type,previous_status,next_status,previous_streak,next_streak,streak_value,metadata,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"events": res.data or []}


@router.get("/streak/statistics")
def get_streak_statistics(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    streak = get_study_streak(current_user)
    events = (
        supabase.table("streak_events")
        .select("event_type,metadata,created_at")
        .eq("user_id", user_id)
        .execute()
    ).data or []
    broken_count = sum(1 for event in events if event.get("event_type") == "STREAK_BROKEN")
    restores_used = sum(1 for event in events if event.get("event_type") == "RESTORE_USED")
    shields_used = sum(1 for event in events if event.get("event_type") == "SHIELD_USED")
    restored = sum(1 for event in events if event.get("event_type") in ("STREAK_RESTORED", "RESTORE_USED"))
    restore_opportunities = sum(1 for event in events if event.get("event_type") in ("STREAK_FROZEN", "STREAK_BROKEN"))
    success_rate = round((restored / restore_opportunities) * 100) if restore_opportunities else 0

    return {
        "current_streak": streak["current_streak"],
        "longest_streak": streak["longest_streak"],
        "restores_used": restores_used,
        "restore_tokens": streak["restore_tokens"],
        "restore_success_rate": success_rate,
        "broken_streak_count": broken_count,
        "shield_activations": shields_used,
        "total_study_days": streak["total_study_days"],
    }


@router.get("/streak/calendar")
def get_streak_calendar(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    since = datetime.now(timezone.utc) - timedelta(days=120)
    res = (
        supabase.table("streak_events")
        .select("event_type,metadata,created_at")
        .eq("user_id", user_id)
        .gte("created_at", since.isoformat())
        .execute()
    )
    days: dict[str, dict[str, Any]] = {}
    for event in res.data or []:
        created = parse_date_robust(event.get("created_at"))
        if not created:
            continue
        day = created.strftime("%Y-%m-%d")
        item = days.setdefault(day, {"date": day, "qualified": False, "frozen": False, "restored": False, "broken": False})
        event_type = event.get("event_type")
        if event_type in ("STREAK_STARTED", "STREAK_INCREMENTED", "STREAK_RESTORED", "RESTORE_USED"):
            item["qualified"] = True
        if event_type == "STREAK_FROZEN":
            item["frozen"] = True
        if event_type in ("STREAK_RESTORED", "RESTORE_USED"):
            item["restored"] = True
        if event_type == "STREAK_BROKEN":
            item["broken"] = True
    return {"days": list(days.values())}
