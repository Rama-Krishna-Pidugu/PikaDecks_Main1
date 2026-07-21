import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import supabase
from app.observability import capture_backend_exception
from app.services.get_current_user import get_current_user
from notificationservices.notifier import initialize_firebase, is_unregistered_token_error, send_push


router = APIRouter(prefix="/notifications", tags=["notifications"])


class DeviceTokenRequest(BaseModel):
    device_id: str | None = None
    push_token: str
    platform: str = "unknown"
    app_version: str | None = None


class NotificationOpenedRequest(BaseModel):
    idempotency_key: str
    notification_type: str | None = None

class NotificationActionRequest(BaseModel):
    idempotency_key: str
    action: str
    notification_type: str | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_platform(platform: str) -> str:
    return platform if platform in {"android", "ios", "web", "unknown"} else "unknown"


def _debug_exception_detail(exc: Exception):
    if isinstance(exc, HTTPException):
        return exc.detail
    return str(exc)


@router.post("/device-token")
def register_device_token(
    body: DeviceTokenRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    now = _now_iso()

    try:
        payload = {
            "user_id": user_id,
            "device_id": body.device_id,
            "push_token": body.push_token,
            "platform": _normalize_platform(body.platform),
            "app_version": body.app_version,
            "is_active": True,
            "last_seen_at": now,
            "updated_at": now,
        }

        result = (
            supabase.table("user_push_tokens")
            .upsert(payload, on_conflict="user_id,push_token")
            .execute()
        )

        settings = (
            supabase.table("notification_settings")
            .select("user_id")
            .eq("user_id", user_id)
            .execute()
        )
        if not settings.data:
            supabase.table("notification_settings").insert({"user_id": user_id}).execute()

        return {"success": True, "token": result.data[0] if result.data else None}
    except Exception as exc:
        debug_detail = _debug_exception_detail(exc)
        print(f"[NOTIFICATIONS] register_device_token failed for user {user_id}: {debug_detail}")
        capture_backend_exception(
            exc,
            feature="notifications",
            action="register_device_token",
            tags={"user_id": user_id},
            extra={"detail": debug_detail},
        )
        return {
            "success": False,
            "warning": "Could not register notification token",
        }


@router.delete("/device-token")
def unregister_device_token(
    body: DeviceTokenRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    try:
        query = (
            supabase.table("user_push_tokens")
            .update({"is_active": False, "updated_at": _now_iso()})
            .eq("user_id", user_id)
            .eq("push_token", body.push_token)
        )

        if body.device_id:
            query = query.eq("device_id", body.device_id)

        query.execute()
        return {"success": True}
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="notifications",
            action="unregister_device_token",
            tags={"user_id": user_id},
        )
        raise HTTPException(status_code=502, detail="Could not unregister notification token") from exc


@router.post("/opened")
def mark_notification_opened(
    body: NotificationOpenedRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    try:
        query = (
            supabase.table("notification_logs")
            .update({"status": "opened", "opened_at": _now_iso()})
            .eq("user_id", user_id)
            .eq("idempotency_key", body.idempotency_key)
        )

        result = query.execute()
        return {"success": True, "updated": len(result.data or [])}
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="notifications",
            action="mark_notification_opened",
            tags={"user_id": user_id},
        )
        raise HTTPException(status_code=502, detail="Could not mark notification opened") from exc


@router.post("/action")
def log_notification_action(
    body: NotificationActionRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]

    try:
        # First get the existing data so we can append the action
        existing = (
            supabase.table("notification_logs")
            .select("id, data")
            .eq("user_id", user_id)
            .eq("idempotency_key", body.idempotency_key)
            .execute()
        )

        if not existing.data:
            return {"success": False, "reason": "Notification log not found"}

        row = existing.data[0]
        data_json = row.get("data", {})
        data_json["action_taken"] = body.action

        query = (
            supabase.table("notification_logs")
            .update({"status": "opened", "opened_at": _now_iso(), "data": data_json})
            .eq("id", row["id"])
        )

        result = query.execute()
        return {"success": True, "updated": len(result.data or [])}
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="notifications",
            action="log_notification_action",
            tags={"user_id": user_id},
        )
        raise HTTPException(status_code=502, detail="Could not log notification action") from exc


@router.post("/test")
def send_test_notification(current_user: dict = Depends(get_current_user)):
    if os.getenv("SENTRY_ENVIRONMENT") == "production":
        raise HTTPException(status_code=404, detail="Not found")

    user_id = current_user["user_id"]
    idempotency_key = f"{user_id}-test-{int(datetime.now(timezone.utc).timestamp())}"
    title = "PikaDecks test notification"
    body = "If you see this, AWS backend to FCM is working."

    try:
        tokens = (
            supabase.table("user_push_tokens")
            .select("push_token")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )

        if not tokens.data:
            raise HTTPException(status_code=404, detail="No active push token found for this user")

        initialize_firebase()
        sent = 0
        failed = 0

        for token_row in tokens.data:
            try:
                send_push(
                    token_row["push_token"],
                    title,
                    body,
                    data={
                        "type": "daily_review",
                        "target": "/home",
                        "idempotency_key": idempotency_key,
                        "test": "true",
                    },
                )
                sent += 1
            except Exception as exc:
                if is_unregistered_token_error(exc):
                    supabase.table("user_push_tokens").update({
                        "is_active": False,
                        "updated_at": _now_iso(),
                    }).eq("push_token", token_row["push_token"]).execute()
                    failed += 1
                    continue
                failed += 1
                capture_backend_exception(
                    exc,
                    feature="notifications",
                    action="send_test_push",
                    tags={"user_id": user_id},
                    extra={"idempotency_key": idempotency_key},
                )

        supabase.table("notification_logs").insert({
            "user_id": user_id,
            "notification_type": "daily_review",
            "title": title,
            "body": body,
            "status": "sent" if sent else "failed",
            "data": {"test": True, "sent": sent, "failed": failed},
            "idempotency_key": idempotency_key,
        }).execute()

        return {"success": sent > 0, "sent": sent, "failed": failed}
    except HTTPException:
        raise
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="notifications",
            action="send_test_notification",
            tags={"user_id": user_id},
        )
        raise HTTPException(status_code=502, detail="Could not send test notification") from exc
