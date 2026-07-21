import json
import os
import sys
from datetime import datetime, timezone, timedelta
from collections import defaultdict

# Add parent directory to sys.path to allow importing from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.runtime_config import load_runtime_config

load_runtime_config()

from app.database import supabase
from app.observability import capture_backend_exception, init_sentry
from notificationservices.templates import render
from notificationservices.notifier import initialize_firebase, is_unregistered_token_error, send_push
from notificationservices.config import (
    NOTIFICATION_COOLDOWN_HOURS,
    MAX_NOTIFICATIONS_PER_DAY,
    MIN_DUE_CARDS
)

init_sentry()


def normalize_event(event):
    if isinstance(event, str):
        event = event.strip()
        try:
            parsed = json.loads(event)
            if isinstance(parsed, dict):
                event = parsed
            else:
                return {}
        except json.JSONDecodeError:
            return {}

    if isinstance(event, dict):
        for key in ("body", "input", "detail"):
            value = event.get(key)
            if isinstance(value, dict) and value.get("job_type"):
                return value
            if isinstance(value, str):
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, dict) and parsed.get("job_type"):
                        return parsed
                except json.JSONDecodeError:
                    pass
        return event

    return {}


# -------------------------------
# Candidate Collection
# -------------------------------
def get_notification_candidates():
    candidates = []
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_str = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    # STREAK EXPIRING
    # current_streak > 0 AND last_study_date < CURRENT_DATE
    streak_res = supabase.table("user_streaks").select("user_id,current_streak,last_study_date").gt("current_streak", 0).lt("last_study_date", today_str).execute()
    if streak_res.data:
        for record in streak_res.data:
            candidates.append({
                "user_id": record["user_id"],
                "type": "streak",
                "score": 100,
                "metadata": {
                    "streak_days": record["current_streak"]
                }
            })

    # DUE CARDS
    # user_id, COUNT(*) FROM reviews WHERE next_review_at <= NOW() GROUP BY user_id
    reviews_res = supabase.table("reviews").select("user_id").lte("next_review_at", now_str).execute()
    if reviews_res.data:
        user_counts = defaultdict(int)
        for record in reviews_res.data:
            user_counts[record["user_id"]] += 1
        
        for user_id, count in user_counts.items():
            if count >= MIN_DUE_CARDS:
                candidates.append({
                    "user_id": user_id,
                    "type": "overdue_review",
                    "score": min(80 + count, 100),
                    "metadata": {
                        "count": count
                    }
                })

    # DAILY REVIEW
    # Send a daily habit reminder to users with active tokens unless they opted out.
    daily_token_res = (
        supabase.table("user_push_tokens")
        .select("user_id")
        .eq("is_active", True)
        .execute()
    )
    disabled_settings_res = (
        supabase.table("notification_settings")
        .select("user_id")
        .eq("daily_review_reminders", False)
        .execute()
    )
    disabled_daily_users = {
        record["user_id"]
        for record in (disabled_settings_res.data or [])
        if record.get("user_id")
    }
    if daily_token_res.data:
        seen_users = set()
        for record in daily_token_res.data:
            user_id = record["user_id"]
            if user_id in seen_users or user_id in disabled_daily_users:
                continue
            seen_users.add(user_id)
            candidates.append({
                "user_id": user_id,
                "type": "daily_review",
                "score": 60,
                "metadata": {}
            })

    return candidates

# -------------------------------
# Anti-Spam Rules
# -------------------------------
def check_daily_limit(user_id, max_per_day=3):
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    logs_res = supabase.table("notification_logs").select("id", count="exact").eq("user_id", user_id).gte("sent_at", f"{today_str}T00:00:00Z").execute()
    count = logs_res.count if logs_res.count is not None else len(logs_res.data or [])
    return count < max_per_day

def check_cooldown(user_id):
    last_log_res = supabase.table("notification_logs").select("sent_at").eq("user_id", user_id).order("sent_at", desc=True).limit(1).execute()
    if last_log_res.data and len(last_log_res.data) > 0:
        last_sent_str = last_log_res.data[0]["sent_at"]
        try:
            last_sent = datetime.fromisoformat(last_sent_str.replace("Z", "+00:00"))
            if last_sent.tzinfo is None:
                last_sent = last_sent.replace(tzinfo=timezone.utc)
            diff_hours = (datetime.now(timezone.utc) - last_sent).total_seconds() / 3600
            if diff_hours < NOTIFICATION_COOLDOWN_HOURS:
                return False
        except ValueError:
            pass
    return True

def can_send_notification(user_id, max_per_day=3):
    if not check_daily_limit(user_id, max_per_day):
        return False
    return check_cooldown(user_id)

# -------------------------------
# Select Best Notification
# -------------------------------
def select_best_notifications(candidates):
    best = {}
    for candidate in candidates:
        uid = candidate["user_id"]
        if uid not in best:
            best[uid] = candidate
            continue

        if candidate["score"] > best[uid]["score"]:
            best[uid] = candidate

    return list(best.values())


def get_recent_messages(user_id, notification_type):
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    logs_res = (
        supabase.table("notification_logs")
        .select("title,body")
        .eq("user_id", user_id)
        .eq("notification_type", notification_type)
        .gte("sent_at", since)
        .execute()
    )

    return {
        (row.get("title"), row.get("body"))
        for row in (logs_res.data or [])
        if row.get("title") and row.get("body")
    }


def render_unique_payload(user_id, notification_type, metadata):
    recent_messages = get_recent_messages(user_id, notification_type)
    return render(notification_type, metadata, recent_messages)


def deactivate_push_token(token):
    supabase.table("user_push_tokens").update({
        "is_active": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("push_token", token).execute()


# -------------------------------
# Send Notifications
# -------------------------------
def send_notifications(notifications, slot_name=None, limits_map=None):
    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    if limits_map is None:
        limits_map = {}

    for n in notifications:
        user_id = n["user_id"]
        max_per_day = limits_map.get(user_id, 3)

        # Enforce daily limit for ALL notifications
        if not check_daily_limit(user_id, max_per_day):
            continue

        # Enforce cooldown only for generic/non-slot notifications
        if not slot_name:
            if not check_cooldown(user_id):
                continue
            utc_hour = datetime.now(timezone.utc).hour
            idempotency_key = f"{user_id}-{n['type']}-{today_str}-{utc_hour}"
        else:
            idempotency_key = f"{user_id}-{slot_name}-{today_str}"
            # Check database for duplicate slot notification
            dup_res = supabase.table("notification_logs").select("id").eq("idempotency_key", idempotency_key).execute()
            if dup_res.data:
                continue

        tokens_res = supabase.table("user_push_tokens").select("push_token").eq("user_id", user_id).eq("is_active", True).execute()
        if not tokens_res.data:
            continue

        try:
            initialize_firebase()
        except Exception as exc:
            capture_backend_exception(
                exc,
                feature="notifications",
                action="firebase_initialization_failed",
                tags={"user_id": user_id},
            )
            print(f"Firebase initialization failed: {exc}")
            continue
        payload = render_unique_payload(user_id, n["type"], n["metadata"])
        success = False

        # Ensure we pass strings in FCM data payload
        data_payload = {
            "type": n["type"],
            "idempotency_key": idempotency_key
        }
        
        # Route 8:00 AM slot specifically to the Review screen
        if slot_name == "SLOT_8AM":
            data_payload["route"] = "/dashboard/review"
            data_payload["target"] = "/review/start"
        elif slot_name:
            data_payload["route"] = "/dashboard"
            data_payload["target"] = "/home"

        for k, v in n["metadata"].items():
            data_payload[k] = str(v)

        for token_record in tokens_res.data:
            token = token_record["push_token"]
            try:
                send_push(token, payload["title"], payload["body"], data=data_payload)
                success = True
            except Exception as exc:
                if is_unregistered_token_error(exc):
                    deactivate_push_token(token)
                    print(f"Deactivated unregistered FCM token for {idempotency_key}")
                    continue
                capture_backend_exception(
                    exc,
                    feature="notifications",
                    action="send_fcm_push",
                    tags={
                        "user_id": user_id,
                        "notification_type": n["type"],
                    },
                    extra={
                        "idempotency_key": idempotency_key,
                        "metadata": n["metadata"],
                    },
                )
                print(f"Failed to send notification {idempotency_key}: {exc}")

        supabase.table("notification_logs").upsert({
            "user_id": user_id,
            "notification_type": n["type"],
            "title": payload["title"],
            "body": payload["body"],
            "status": "sent" if success else "failed",
            "data": n["metadata"],
            "idempotency_key": idempotency_key
        }, on_conflict="idempotency_key").execute()


def send_test_notifications_to_all_active_tokens(event):
    environment = os.environ.get("SENTRY_ENVIRONMENT") or os.environ.get("STAGE") or ""
    if environment == "production":
        return {
            "statusCode": 403,
            "message": "TEST_ALL is disabled in production",
        }

    limit = event.get("limit")
    target_user_id = event.get("user_id")
    title = event.get("title") or "PikaDecks test notification"
    body = event.get("body") or "If you see this, AWS Lambda to FCM is working."
    now_suffix = str(int(datetime.now(timezone.utc).timestamp()))

    query = (
        supabase.table("user_push_tokens")
        .select("user_id,push_token")
        .eq("is_active", True)
    )
    if target_user_id:
        query = query.eq("user_id", target_user_id)
    if isinstance(limit, int) and limit > 0:
        query = query.limit(limit)

    tokens_res = query.execute()
    if not tokens_res.data:
        return {
            "statusCode": 200,
            "message": "No active push tokens found",
            "job_type": "TEST_ALL",
            "user_id": target_user_id,
            "sent": 0,
            "failed": 0,
            "users": 0,
        }

    try:
        initialize_firebase()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="notifications",
            action="firebase_initialization_failed",
            tags={"user_id": target_user_id or "all"},
        )
        return {
            "statusCode": 500,
            "error": f"Firebase initialization failed: {exc}",
        }

    sent = 0
    failed = 0
    user_results = defaultdict(lambda: {"sent": 0, "failed": 0})

    for token_record in tokens_res.data:
        user_id = token_record["user_id"]
        idempotency_key = f"{user_id}-test-all-{now_suffix}"
        data_payload = {
            "type": "daily_review",
            "target": "/home",
            "idempotency_key": idempotency_key,
            "test": "true",
        }

        try:
            send_push(token_record["push_token"], title, body, data=data_payload)
            sent += 1
            user_results[user_id]["sent"] += 1
        except Exception as exc:
            if is_unregistered_token_error(exc):
                deactivate_push_token(token_record["push_token"])
                failed += 1
                user_results[user_id]["failed"] += 1
                continue
            failed += 1
            user_results[user_id]["failed"] += 1
            capture_backend_exception(
                exc,
                feature="notifications",
                action="send_test_all_push",
                tags={"user_id": user_id},
                extra={"idempotency_key": idempotency_key},
            )

    for user_id, result in user_results.items():
        supabase.table("notification_logs").upsert({
            "user_id": user_id,
            "notification_type": "daily_review",
            "title": title,
            "body": body,
            "status": "sent" if result["sent"] else "failed",
            "data": {
                "test": True,
                "job_type": "TEST_ALL",
                "sent": result["sent"],
                "failed": result["failed"],
            },
            "idempotency_key": f"{user_id}-test-all-{now_suffix}",
        }, on_conflict="idempotency_key").execute()

    return {
        "statusCode": 200,
        "message": "Test notifications processed",
        "job_type": "TEST_ALL",
        "user_id": target_user_id,
        "sent": sent,
        "failed": failed,
        "users": len(user_results),
    }


# -------------------------------
# Helper Functions for New Slots
# -------------------------------
from zoneinfo import ZoneInfo

def has_user_opened_today(user_id: str) -> bool:
    settings_res = supabase.table("notification_settings").select("timezone").eq("user_id", user_id).execute()
    tz_name = "Asia/Kolkata"
    if settings_res.data and settings_res.data[0].get("timezone"):
        tz_name = settings_res.data[0]["timezone"]

    try:
        user_tz = ZoneInfo(tz_name)
    except Exception:
        user_tz = ZoneInfo("Asia/Kolkata")

    now_user = datetime.now(timezone.utc).astimezone(user_tz)
    local_start = now_user.replace(hour=0, minute=0, second=0, microsecond=0)
    local_end = now_user.replace(hour=23, minute=59, second=59, microsecond=999999)

    utc_start_iso = local_start.astimezone(timezone.utc).replace(tzinfo=None).isoformat()
    utc_end_iso = local_end.astimezone(timezone.utc).replace(tzinfo=None).isoformat()

    # Check push token activity today
    tokens_res = (
        supabase.table("user_push_tokens")
        .select("last_seen_at")
        .eq("user_id", user_id)
        .gte("last_seen_at", utc_start_iso)
        .lte("last_seen_at", utc_end_iso)
        .limit(1)
        .execute()
    )
    if tokens_res.data:
        return True

    # Check review activity today
    history_res = (
        supabase.table("review_history")
        .select("reviewed_at")
        .eq("user_id", user_id)
        .gte("reviewed_at", utc_start_iso)
        .lte("reviewed_at", utc_end_iso)
        .limit(1)
        .execute()
    )
    if history_res.data:
        return True

    return False


def get_user_reviews_today(user_id: str) -> int:
    """Returns the number of cards the user has reviewed today (in their local timezone)."""
    settings_res = supabase.table("notification_settings").select("timezone").eq("user_id", user_id).execute()
    tz_name = "Asia/Kolkata"
    if settings_res.data and settings_res.data[0].get("timezone"):
        tz_name = settings_res.data[0]["timezone"]

    try:
        user_tz = ZoneInfo(tz_name)
    except Exception:
        user_tz = ZoneInfo("Asia/Kolkata")

    now_user = datetime.now(timezone.utc).astimezone(user_tz)
    local_start = now_user.replace(hour=0, minute=0, second=0, microsecond=0)
    local_end = now_user.replace(hour=23, minute=59, second=59, microsecond=999999)

    utc_start_iso = local_start.astimezone(timezone.utc).replace(tzinfo=None).isoformat()
    utc_end_iso = local_end.astimezone(timezone.utc).replace(tzinfo=None).isoformat()

    res = (
        supabase.table("review_history")
        .select("history_id", count="exact")
        .eq("user_id", user_id)
        .gte("reviewed_at", utc_start_iso)
        .lte("reviewed_at", utc_end_iso)
        .execute()
    )
    return res.count if res.count is not None else len(res.data or [])

def has_completed_study_today(user_id: str) -> bool:
    """A user has completed study if they did at least 10 reviews today."""
    return get_user_reviews_today(user_id) >= 10

def has_opened_app_today(user_id: str) -> bool:
    """A user has opened the app today if their push token was seen in the last 24 hours."""
    try:
        res = supabase.table("user_push_tokens").select("last_seen_at").eq("user_id", user_id).order("last_seen_at", desc=True).limit(1).execute()
        if not res.data:
            return False
        last_seen_str = res.data[0]["last_seen_at"]
        last_seen = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        return (now - last_seen).total_seconds() < 86400
    except Exception:
        return False


def is_notification_enabled(user_id: str, slot: str) -> bool:
    settings_res = supabase.table("notification_settings").select("*").eq("user_id", user_id).execute()
    if not settings_res.data:
        return True
    settings = settings_res.data[0]
    if slot == "SLOT_1130PM":
        return bool(settings.get("streak_notifications", True))
    else:
        return bool(settings.get("daily_review_reminders", True))


# -------------------------------
# Lambda Handler
# -------------------------------
def handler(event, context):
    print("Notification Job Started", event)
    event = normalize_event(event)
    try:
        job_type = event.get("job_type", "MORNING")
        if job_type == "TEST_ALL":
            return send_test_notifications_to_all_active_tokens(event)

        # Legacy 3:55 PM Slot
        if job_type == "AFTERNOON":
            return {
                "statusCode": 200,
                "message": "AFTERNOON is disabled",
            }

        # New Engagement/Conditional Slots
        engagement_slots = {
            "SLOT_8AM": "engagement_8am",
            "SLOT_10AM": "engagement_10am",
            "SLOT_1PM": "engagement_1pm",
            "SLOT_6PM": "engagement_6pm",
            "SLOT_9PM": "night_reminder_9pm",
        }

        if job_type in engagement_slots:
            n_type = engagement_slots[job_type]

            # Fetch all users with active push tokens
            tokens_res = (
                supabase.table("user_push_tokens")
                .select("user_id")
                .eq("is_active", True)
                .execute()
            )
            all_users = list({t["user_id"] for t in tokens_res.data or []})

            # Fetch user stats safely (for adaptive frequency & smart timing)
            user_stats = {}
            try:
                user_stats_res = supabase.table("user_stats").select("user_id, consecutive_ignored_days, preferred_study_hour").execute()
                user_stats = {row["user_id"]: row for row in user_stats_res.data or []}
            except Exception as e:
                print(f"Warning: Failed to fetch user_stats: {e}")

            notifications = []
            limits_map = {}

            for user_id in all_users:
                if not is_notification_enabled(user_id, job_type):
                    continue

                stats = user_stats.get(user_id, {})
                ignored_days = stats.get("consecutive_ignored_days", 0)
                preferred_hour = stats.get("preferred_study_hour")

                opened_app = has_opened_app_today(user_id)
                completed_study = has_completed_study_today(user_id)

                if opened_app and ignored_days > 0:
                    try:
                        supabase.table("user_stats").update({"consecutive_ignored_days": 0}).eq("user_id", user_id).execute()
                        ignored_days = 0
                    except Exception:
                        pass

                # Adaptive frequency limit
                limits_map[user_id] = 5 if ignored_days >= 3 else 3

                # Option A: Smart Timing Check
                if preferred_hour is not None:
                    current_hour = datetime.now(timezone.utc).hour
                    diff = min(abs(current_hour - preferred_hour), 24 - abs(current_hour - preferred_hour))
                    if diff > 3 and job_type != "SLOT_8AM":
                        continue # Skip slot if too far from preferred window

                # Evaluate Notification Rules
                should_send = False
                if job_type == "SLOT_8AM":
                    should_send = True
                elif job_type == "SLOT_10AM":
                    should_send = not opened_app and not completed_study
                elif job_type == "SLOT_1PM":
                    should_send = not opened_app and not completed_study
                elif job_type == "SLOT_6PM":
                    should_send = not completed_study
                elif job_type == "SLOT_9PM":
                    should_send = not completed_study

                if not should_send:
                    continue

                notifications.append({
                    "user_id": user_id,
                    "type": n_type,
                    "metadata": {"streak_days": 0},
                })

            # Enrich with streak data
            if notifications:
                streak_res = (
                    supabase.table("user_streaks")
                    .select("user_id,current_streak")
                    .in_("user_id", [n["user_id"] for n in notifications])
                    .execute()
                )
                streaks = {s["user_id"]: s["current_streak"] for s in streak_res.data or []}
                for n in notifications:
                    n["metadata"]["streak_days"] = streaks.get(n["user_id"], 0)
            
            if notifications:
                send_notifications(notifications, slot_name=job_type, limits_map=limits_map)

            return {
                "statusCode": 200,
                "message": f"Processed slot {job_type}",
                "job_type": job_type,
                "notification_count": len(notifications),
            }

        if job_type == "SLOT_1130PM":
            return {
                "statusCode": 200,
                "message": "SLOT_1130PM is disabled",
            }

        return {
            "statusCode": 400,
            "message": f"Unknown job type: {job_type}",
        }

    except Exception as e:
        capture_backend_exception(
            e,
            feature="notifications",
            action="scheduled_notification_job",
            tags={
                "job_type": event.get("job_type", "MORNING") if isinstance(event, dict) else "unknown",
            },
            extra={
                "event": event,
            },
        )
        print(f"Job failed: {e}")
        return {
            "statusCode": 500,
            "error": str(e)
        }
