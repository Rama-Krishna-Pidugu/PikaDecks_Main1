from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Any

from fastapi import HTTPException

from app.database import supabase
from app.services.s3_utils import presign_s3_url


VALID_RATINGS = {"again", "hard", "good", "easy"}
LEARNING_STEPS = {
    "again": timedelta(minutes=5),
    "hard": timedelta(minutes=10),
    "good": timedelta(minutes=20),
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    cleaned = value.replace("Z", "").replace(" ", "T")
    if "+" in cleaned:
        cleaned = cleaned.split("+", 1)[0]
    try:
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


def ensure_owned_deck(deck_id: str, user_id: str) -> dict[str, Any]:
    response = (
        supabase.table("decks")
        .select("*")
        .eq("deck_id", deck_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Deck not found")
    return response.data[0]


def get_card_for_user(card_id: str, user_id: str, deck_id: str | None = None) -> dict[str, Any]:
    query = supabase.table("cards").select("*").eq("card_id", card_id).limit(1)
    if deck_id:
        query = query.eq("deck_id", deck_id)
    card_response = query.execute()
    if not card_response.data:
        raise HTTPException(status_code=404, detail="Card not found")

    card = card_response.data[0]
    ensure_owned_deck(card["deck_id"], user_id)
    return card


def create_initial_review_state(user_id: str, deck_id: str, card_id: str) -> dict[str, Any]:
    immediate_due = now_utc() - timedelta(days=1)
    response = (
        supabase.table("reviews")
        .insert({
            "user_id": user_id,
            "deck_id": deck_id,
            "card_id": card_id,
            "ease_factor": 2.5,
            "interval_days": 0,
            "repetitions": 0,
            "lapses": 0,
            "review_count": 0,
            "learning_state": "new",
            "next_review_at": iso(immediate_due),
        })
        .execute()
    )
    return response.data[0]


def get_or_create_review_state(user_id: str, card_id: str, deck_id: str | None = None) -> dict[str, Any]:
    response = (
        supabase.table("reviews")
        .select("*")
        .eq("user_id", user_id)
        .eq("card_id", card_id)
        .limit(1)
        .execute()
    )
    if response.data:
        return response.data[0]

    card = get_card_for_user(card_id, user_id, deck_id)
    return create_initial_review_state(user_id, card["deck_id"], card_id)


def calculate_schedule(review: dict[str, Any], rating: str, reviewed_at: datetime | None = None) -> dict[str, Any]:
    if rating not in VALID_RATINGS:
        raise HTTPException(status_code=400, detail="Invalid rating")

    reviewed = reviewed_at or now_utc()
    state = review.get("learning_state") or "new"
    ease = max(1.3, float(review.get("ease_factor") or 2.5))
    interval = max(0, int(review.get("interval_days") or 0))
    repetitions = max(0, int(review.get("repetitions") or 0))
    lapses = max(0, int(review.get("lapses") or 0))
    review_count = max(0, int(review.get("review_count") or 0)) + 1

    if rating == "again":
        ease = max(1.3, ease - 0.2)
        lapses += 1 if state == "review" else 0
        next_review = reviewed + LEARNING_STEPS["again"]
        return {
            "ease_factor": round(ease, 2),
            "interval_days": 0,
            "repetitions": 0 if state in {"new", "learning"} else repetitions,
            "lapses": lapses,
            "review_count": review_count,
            "learning_state": "relearning" if state == "review" else "learning",
            "last_reviewed_at": iso(reviewed),
            "last_reviewed": iso(reviewed),
            "next_review_at": iso(next_review),
            "next_review_date": iso(next_review),
            "updated_at": iso(reviewed),
        }

    if rating == "hard":
        ease = max(1.3, ease - 0.15)
        if state in {"new", "learning", "relearning"}:
            next_review = reviewed + LEARNING_STEPS["hard"]
            new_state = "learning" if state != "relearning" else "relearning"
            new_interval = 0
        else:
            new_interval = max(1, ceil(interval * 1.2))
            next_review = reviewed + timedelta(days=new_interval)
            new_state = "review"
        return {
            "ease_factor": round(ease, 2),
            "interval_days": new_interval,
            "repetitions": repetitions + 1,
            "lapses": lapses,
            "review_count": review_count,
            "learning_state": new_state,
            "last_reviewed_at": iso(reviewed),
            "last_reviewed": iso(reviewed),
            "next_review_at": iso(next_review),
            "next_review_date": iso(next_review),
            "updated_at": iso(reviewed),
        }

    if rating == "good":
        if state in {"new", "learning"} and repetitions < 1:
            new_interval = 0
            next_review = reviewed + LEARNING_STEPS["good"]
            new_state = "learning"
        elif state == "relearning":
            new_interval = max(1, interval)
            next_review = reviewed + timedelta(days=new_interval)
            new_state = "review"
        else:
            base = interval if interval > 0 else 1
            new_interval = max(1, ceil(base * ease))
            next_review = reviewed + timedelta(days=new_interval)
            new_state = "review"
        return {
            "ease_factor": round(ease, 2),
            "interval_days": new_interval,
            "repetitions": repetitions + 1,
            "lapses": lapses,
            "review_count": review_count,
            "learning_state": new_state,
            "last_reviewed_at": iso(reviewed),
            "last_reviewed": iso(reviewed),
            "next_review_at": iso(next_review),
            "next_review_date": iso(next_review),
            "updated_at": iso(reviewed),
        }

    ease = min(3.0, ease + 0.15)
    base = interval if interval > 0 else 1
    new_interval = 4 if state in {"new", "learning"} else max(3, ceil(base * ease * 1.5))
    next_review = reviewed + timedelta(days=new_interval)
    return {
        "ease_factor": round(ease, 2),
        "interval_days": new_interval,
        "repetitions": repetitions + 1,
        "lapses": lapses,
        "review_count": review_count,
        "learning_state": "review",
        "last_reviewed_at": iso(reviewed),
        "last_reviewed": iso(reviewed),
        "next_review_at": iso(next_review),
        "next_review_date": iso(next_review),
        "updated_at": iso(reviewed),
    }


def card_from_review_row(row: dict[str, Any]) -> dict[str, Any] | None:
    card = row.get("cards")
    if not isinstance(card, dict):
        return None
    return {
        "card_id": card.get("card_id"),
        "deck_id": card.get("deck_id") or row.get("deck_id"),
        "question": card.get("question"),
        "answer": card.get("answer"),
        "explanation": card.get("explanation"),
        "difficulty": card.get("difficulty"),
        "image_url": presign_s3_url(card.get("image_key")),
        "notes_image_url": presign_s3_url(card.get("notes_image_key")),
        "review": {
            "ease_factor": row.get("ease_factor"),
            "interval_days": row.get("interval_days"),
            "repetitions": row.get("repetitions"),
            "lapses": row.get("lapses"),
            "review_count": row.get("review_count"),
            "learning_state": row.get("learning_state"),
            "last_reviewed_at": row.get("last_reviewed_at"),
            "next_review_at": row.get("next_review_at"),
        },
    }


def due_reviews_query(user_id: str, deck_id: str | None = None, limit: int = 50):
    query = (
        supabase.table("reviews")
        .select("*,cards(card_id,deck_id,question,answer,explanation,difficulty,card_order,image_key,notes_image_key)")
        .eq("user_id", user_id)
        .lte("next_review_at", iso(now_utc()))
        .order("next_review_at")
        .limit(limit)
    )
    if deck_id:
        query = query.eq("deck_id", deck_id)
    return query.execute().data or []


def count_reviews(user_id: str, deck_id: str | None = None, due_only: bool = False, state: str | None = None) -> int:
    query = supabase.table("reviews").select("review_id", count="exact").eq("user_id", user_id).limit(1)
    if deck_id:
        query = query.eq("deck_id", deck_id)
    if due_only:
        query = query.lte("next_review_at", iso(now_utc()))
    if state:
        query = query.eq("learning_state", state)
    return query.execute().count or 0


def deck_progress(user_id: str, deck_id: str) -> dict[str, int]:
    total = supabase.table("cards").select("card_id", count="exact").eq("deck_id", deck_id).limit(1).execute().count or 0
    due = count_reviews(user_id, deck_id=deck_id, due_only=True)
    review = count_reviews(user_id, deck_id=deck_id, state="review")
    return {
        "total_cards": total,
        "due_cards": due,
        "learned_cards": review,
        "new_cards": count_reviews(user_id, deck_id=deck_id, state="new"),
    }


def start_review_session(user_id: str, deck_id: str, limit: int = 20) -> dict[str, Any]:
    deck_ids = [d.strip() for d in deck_id.split(",") if d.strip()]
    if not deck_ids:
        raise HTTPException(status_code=400, detail="No deck IDs provided")

    for d_id in deck_ids:
        ensure_owned_deck(d_id, user_id)

    card_query = (
        supabase.table("cards")
        .select("card_id,deck_id")
        .limit(10000)
    )
    if len(deck_ids) == 1:
        card_query = card_query.eq("deck_id", deck_ids[0])
    else:
        card_query = card_query.in_("deck_id", deck_ids)

    deck_cards = card_query.execute().data or []
    review_query = (
        supabase.table("reviews")
        .select("card_id")
        .eq("user_id", user_id)
        .limit(10000)
    )
    if len(deck_ids) == 1:
        review_query = review_query.eq("deck_id", deck_ids[0])
    else:
        review_query = review_query.in_("deck_id", deck_ids)

    existing_review_card_ids = {
        row.get("card_id")
        for row in (review_query.execute().data or [])
        if row.get("card_id")
    }
    missing_review_rows = [
        {
            "user_id": user_id,
            "deck_id": card["deck_id"],
            "card_id": card["card_id"],
            "ease_factor": 2.5,
            "interval_days": 0,
            "repetitions": 0,
            "lapses": 0,
            "review_count": 0,
            "learning_state": "new",
            "next_review_at": iso(now_utc() - timedelta(days=1)),
        }
        for card in deck_cards
        if card.get("card_id") and card.get("card_id") not in existing_review_card_ids
    ]
    if missing_review_rows:
        supabase.table("reviews").insert(missing_review_rows).execute()
    
    query = (
        supabase.table("reviews")
        .select("*,cards(card_id,deck_id,question,answer,explanation,difficulty,card_order,image_key,notes_image_key)")
        .eq("user_id", user_id)
    )
    if len(deck_ids) == 1:
        query = query.eq("deck_id", deck_ids[0])
    else:
        query = query.in_("deck_id", deck_ids)

    rows = query.limit(10000).execute().data or []
    
    import random
    
    now = now_utc()
    pool_weak = []
    pool_learning = []
    pool_mastered = []
    pool_random = []
    
    scored_cards = []
    for row in rows:
        card = card_from_review_row(row)
        if not card:
            continue
            
        rev = row
        state = rev.get("learning_state") or "new"
        ease = max(1.3, float(rev.get("ease_factor") or 2.5))
        interval = max(0, int(rev.get("interval_days") or 0))
        repetitions = max(0, int(rev.get("repetitions") or 0))
        lapses = max(0, int(rev.get("lapses") or 0))
        
        # Calculate mastery (0.0 to 1.0)
        if state == "new":
            mastery = 0.0
        elif state in {"learning", "relearning"}:
            mastery = min(0.5, (repetitions * 0.1) + 0.1)
        else: # state == "review"
            mastery = min(1.0, 0.5 + (interval / 100.0) * 0.5)
            
        # Calculate overdue days
        next_review_at = parse_datetime(rev.get("next_review_at") or rev.get("next_review_date"))
        overdue_days = 0.0
        if next_review_at:
            overdue_days = (now - next_review_at).total_seconds() / 86400.0
            
        mastery_weight = (1.0 - mastery) * 50.0
        overdue_bonus = min(50.0, max(0.0, overdue_days) * 5.0)
        # Boost new, unreviewed cards so they appear in review sessions immediately
        new_card_bonus = 25.0 if state == "new" and repetitions == 0 else 0.0
        random_factor = random.uniform(0.0, 10.0)
        
        priority_score = mastery_weight + overdue_bonus + new_card_bonus + random_factor
        card["priority_score"] = priority_score
        scored_cards.append(card)
        
        # Classify card pools
        is_weak = (state in {"learning", "relearning"} and lapses > 0) or ease < 2.2 or (state != "new" and interval < 2)
        if is_weak:
            pool_weak.append(card)
        elif state in {"new", "learning", "relearning"}:
            pool_learning.append(card)
        elif state == "review" and interval >= 2:
            pool_mastered.append(card)
        else:
            pool_random.append(card)
            
    # Target counts: 40% Weak, 30% Learning, 20% Mastered, 10% Random
    target_weak = max(0, round(limit * 0.40))
    target_learning = max(0, round(limit * 0.30))
    target_mastered = max(0, round(limit * 0.20))
    
    # Sort pools by priority_score descending
    pool_weak.sort(key=lambda x: x["priority_score"], reverse=True)
    pool_learning.sort(key=lambda x: x["priority_score"], reverse=True)
    pool_mastered.sort(key=lambda x: x["priority_score"], reverse=True)
    
    selected_cards = []
    
    def select_from_pool(pool, count):
        selected = pool[:count]
        del pool[:count]
        return selected

    selected_cards.extend(select_from_pool(pool_weak, target_weak))
    selected_cards.extend(select_from_pool(pool_learning, target_learning))
    selected_cards.extend(select_from_pool(pool_mastered, target_mastered))
    
    # Fill remaining from all remaining cards sorted by priority_score
    remaining_pool = pool_weak + pool_learning + pool_mastered + pool_random
    remaining_pool.sort(key=lambda x: x["priority_score"], reverse=True)
    
    needed = limit - len(selected_cards)
    if needed > 0:
        selected_cards.extend(select_from_pool(remaining_pool, needed))
        
    # Shuffle final review session list
    random.shuffle(selected_cards)
    
    # Remove priority_score key
    for c in selected_cards:
        c.pop("priority_score", None)
        
    # Aggregate deck progress
    total_cards = 0
    due_cards = 0
    learned_cards = 0
    new_cards = 0
    for d_id in deck_ids:
        progress = deck_progress(user_id, d_id)
        total_cards += progress.get("total_cards", 0)
        due_cards += progress.get("due_cards", 0)
        learned_cards += progress.get("learned_cards", 0)
        new_cards += progress.get("new_cards", 0)

    progress_data = {
        "total_cards": total_cards,
        "due_cards": due_cards,
        "learned_cards": learned_cards,
        "new_cards": new_cards,
    }

    return {
        "success": True,
        "cards": selected_cards,
        "next_card": selected_cards[0] if selected_cards else None,
        "remaining_cards": len(selected_cards),
        "deck_progress": progress_data,
    }


def submit_review_rating(
    user_id: str,
    card_id: str,
    rating: str,
    deck_id: str | None = None,
    reviewed_client_at: str | None = None,
) -> dict[str, Any]:
    review = get_or_create_review_state(user_id, card_id, deck_id)
    card_deck_id = review.get("deck_id") or deck_id
    if not card_deck_id:
        card_deck_id = get_card_for_user(card_id, user_id).get("deck_id")
    ensure_owned_deck(card_deck_id, user_id)

    reviewed_at = parse_datetime(reviewed_client_at) or now_utc()
    updates = calculate_schedule(review, rating, reviewed_at)

    updated = (
        supabase.table("reviews")
        .update(updates)
        .eq("review_id", review["review_id"])
        .execute()
    )

    # Log review to history
    supabase.table("review_history").insert({
        "user_id": user_id,
        "deck_id": card_deck_id,
        "card_id": card_id,
        "rating": rating,
        "reviewed_at": iso(reviewed_at),
        "reviewed_client_at": iso(reviewed_at) if reviewed_client_at else None,
        "synced_at": iso(now_utc()),
    }).execute()

    # Update streak if meaningful session completed
    try:
        from app.services.streak_resolver import process_meaningful_session
        # Count reviews for user today
        today_start = now_utc().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        count_res = supabase.table("review_history").select("history_id").eq("user_id", user_id).gte("reviewed_at", today_start).execute()
        cards_reviewed_today = len(count_res.data or [])
        process_meaningful_session(user_id, cards_reviewed_today)
    except Exception as e:
        print(f"Streak update failed: {e}")

    remaining_rows = due_reviews_query(user_id, deck_id=card_deck_id, limit=1)
    next_card = card_from_review_row(remaining_rows[0]) if remaining_rows else None

    return {
        "success": True,
        "schedule": updated.data[0] if updated.data else {**review, **updates},
        "next_review_at": updates["next_review_at"],
        "remaining_cards": count_reviews(user_id, deck_id=card_deck_id, due_only=True),
        "next_card": next_card,
        "deck_progress": deck_progress(user_id, card_deck_id),
    }


def get_review_overview(user_id: str) -> dict[str, Any]:
    now = now_utc()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    all_reviews = supabase.table("reviews").select("*").eq("user_id", user_id).limit(10000).execute().data or []
    history = (
        supabase.table("review_history")
        .select("rating,reviewed_at")
        .eq("user_id", user_id)
        .order("reviewed_at", desc=True)
        .limit(10000)
        .execute()
        .data or []
    )

    due_today = 0
    overdue = 0
    upcoming = 0
    learned = 0
    decks_breakdown = {}

    # Product-facing classification thresholds (display only, not SRS scheduling)
    NEW_THRESHOLD = 3         # card is "New" until 3 reviews are completed
    DUE_AFTER_DAYS = 1.0     # card becomes Due >= 1 day after last review
    OVERDUE_AFTER_DAYS = 3.0  # card becomes Overdue >= 3 days after last review

    for review in all_reviews:
        deck_id = review.get("deck_id")
        if not deck_id:
            continue

        if deck_id not in decks_breakdown:
            decks_breakdown[deck_id] = {
                "deck_id": deck_id,
                "due": 0,
                "overdue": 0,
                "new": 0,
                "total": 0
            }

        db = decks_breakdown[deck_id]
        db["total"] += 1

        review_count = int(review.get("review_count") or 0)
        last_reviewed_at = parse_datetime(review.get("last_reviewed_at") or review.get("last_reviewed"))

        # Track learned cards via the SRS learning_state (unchanged for scheduling)
        if review.get("learning_state") == "review":
            learned += 1

        # ── New: fewer than 3 completed reviews ──────────────────────────────
        if review_count < NEW_THRESHOLD:
            db["new"] += 1
            # New cards are not yet Due or Overdue
            continue

        # ── Due / Overdue: only once graduated from New ──────────────────────
        if last_reviewed_at is None:
            # Rare edge-case: has review_count >= 3 but no timestamp — treat as overdue
            overdue += 1
            db["overdue"] += 1
            due_today += 1
            db["due"] += 1
            continue

        age_days = (now - last_reviewed_at).total_seconds() / 86400  # fractional days

        if age_days >= OVERDUE_AFTER_DAYS:
            overdue += 1
            db["overdue"] += 1
            due_today += 1
            db["due"] += 1
        elif age_days >= DUE_AFTER_DAYS:
            due_today += 1
            db["due"] += 1
        else:
            # Reviewed recently — upcoming
            upcoming += 1

    reviews_today = 0
    study_dates: set[str] = set()
    remembered = 0
    for item in history:
        reviewed_at = parse_datetime(item.get("reviewed_at"))
        if not reviewed_at:
            continue
        if reviewed_at >= today_start:
            reviews_today += 1
        study_dates.add(reviewed_at.strftime("%Y-%m-%d"))
        if item.get("rating") in {"hard", "good", "easy"}:
            remembered += 1

    current_streak = calculate_current_streak(study_dates, now)
    longest_streak = calculate_longest_streak(study_dates)
    retention = round((remembered / len(history)) * 100, 1) if history else 0
    weekly = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        weekly.append(sum(1 for item in history if (parse_datetime(item.get("reviewed_at")) or now).strftime("%Y-%m-%d") == day))

    return {
        "due_today": due_today,
        "overdue": overdue,
        "upcoming_reviews": upcoming,
        "cards_learned": learned,
        "reviews_today": reviews_today,
        "total_reviews": len(history),
        "average_retention": retention,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "study_days": len(study_dates),
        "weekly": weekly,
        "decks_breakdown": decks_breakdown,
    }


def calculate_current_streak(study_dates: set[str], now: datetime) -> int:
    if not study_dates:
        return 0
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    if today in study_dates:
        cursor = now
    elif yesterday in study_dates:
        cursor = now - timedelta(days=1)
    else:
        return 0

    streak = 0
    while cursor.strftime("%Y-%m-%d") in study_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def calculate_longest_streak(study_dates: set[str]) -> int:
    if not study_dates:
        return 0
    ordered = sorted(datetime.strptime(day, "%Y-%m-%d") for day in study_dates)
    longest = 1
    current = 1
    for idx in range(1, len(ordered)):
        if (ordered[idx] - ordered[idx - 1]).days == 1:
            current += 1
            longest = max(longest, current)
        else:
            current = 1
    return longest
