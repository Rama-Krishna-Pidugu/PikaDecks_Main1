import base64
import datetime
import hashlib
import json
import os
from typing import Any

import requests
from fastapi import HTTPException
from google.oauth2 import service_account
from google.auth.transport.requests import Request as GoogleAuthRequest
import razorpay

from app.database import supabase
from app.observability import capture_backend_exception, log_structured_event, trace_span
from app.credentials import load_packaged_credential


GOOGLE_PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
GOOGLE_PLAY_SUBSCRIPTION_V2_URL = (
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
    "{package_name}/purchases/subscriptionsv2/tokens/{purchase_token}"
)
ALLOWED_ANDROID_SUBSCRIPTIONS = {
    "pikadecks_pro_monthly",
    "pikadecks_yearly_pack",
}
DEFAULT_ANDROID_PACKAGE_NAME = "com.nameisrk.pikadecks"

_credentials_cache: service_account.Credentials | None = None


def is_billing_enabled() -> bool:
    return os.getenv("BILLING_ENABLED", "").lower() == "true"


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)


def parse_google_time(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    try:
        clean_str = value.replace(" ", "T").replace("Z", "")
        if "+" in clean_str:
            clean_str = clean_str.split("+")[0]
        if "." in clean_str:
            clean_str = clean_str.split(".")[0]
        return datetime.datetime.fromisoformat(clean_str).replace(tzinfo=datetime.timezone.utc)
    except Exception:
        return None


def hash_purchase_token(purchase_token: str) -> str:
    return hashlib.sha256(purchase_token.encode("utf-8")).hexdigest()


def get_app_user_id(clerk_user_id: str) -> str:
    result = (
        supabase.table("users")
        .select("user_id")
        .eq("clerk_user_id", clerk_user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data[0]["user_id"]


def _load_google_service_account() -> dict[str, Any]:
    try:
        filename = "google-play-service-account.json"
        
        # Determine physical file existence vs env variables
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cred_path = os.path.join(root_dir, "credentials", filename)
        source = "packaged_file" if os.path.exists(cred_path) else "environment_fallback"
        
        creds = load_packaged_credential(filename)
        
        # Check layout format to see if it is incorrect (Firebase client json vs GCP service account credentials)
        has_client_email = "client_email" in creds
        has_token_uri = "token_uri" in creds
        has_private_key = "private_key" in creds
        has_type = "type" in creds
        is_firebase = "project_info" in creds and "client" in creds
        
        log_structured_event(
            "credentials.google_play_format_check",
            source=source,
            filename=filename,
            project_id=creds.get("project_id") or (creds.get("project_info", {}).get("project_id") if isinstance(creds.get("project_info"), dict) else None),
            client_email=creds.get("client_email"),
            type=creds.get("type"),
            has_client_email=has_client_email,
            has_token_uri=has_token_uri,
            has_private_key=has_private_key,
            has_type=has_type,
            is_firebase_format=is_firebase,
        )
        return creds
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Google Play service account is not configured.") from exc


def _get_google_access_token() -> str:
    global _credentials_cache

    if _credentials_cache is None:
        _credentials_cache = service_account.Credentials.from_service_account_info(
            _load_google_service_account(),
            scopes=[GOOGLE_PLAY_SCOPE],
        )

    if not _credentials_cache.valid:
        _credentials_cache.refresh(GoogleAuthRequest())

    return _credentials_cache.token


def _subscription_status_from_google(state: str | None, expires_at: datetime.datetime | None) -> str:
    now = utcnow()
    if state == "SUBSCRIPTION_STATE_ACTIVE":
        return "active" if not expires_at or expires_at > now else "expired"
    if state == "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
        return "in_grace_period"
    if state == "SUBSCRIPTION_STATE_ON_HOLD":
        return "on_hold"
    if state == "SUBSCRIPTION_STATE_CANCELED":
        return "cancelled" if expires_at and expires_at > now else "expired"
    if state == "SUBSCRIPTION_STATE_EXPIRED":
        return "expired"
    if state == "SUBSCRIPTION_STATE_PENDING":
        return "pending"
    return "unknown"


def _google_package_name(package_name: str | None = None) -> str:
    configured = os.getenv("GOOGLE_PLAY_PACKAGE_NAME", "").strip() or DEFAULT_ANDROID_PACKAGE_NAME
    if package_name and package_name != configured:
        raise HTTPException(status_code=400, detail="Purchase package does not match this app.")
    return configured


def _auto_renewing_from_line_item(line_item: dict[str, Any]) -> bool:
    auto_renewing_plan = line_item.get("autoRenewingPlan") or {}
    if "autoRenewEnabled" in auto_renewing_plan:
        return bool(auto_renewing_plan.get("autoRenewEnabled"))
    return bool(auto_renewing_plan)


def verify_google_play_subscription(product_id: str, purchase_token: str, package_name: str | None = None) -> dict[str, Any]:
    if not is_billing_enabled():
        raise HTTPException(status_code=503, detail="Billing is not enabled for this environment.")

    if product_id not in ALLOWED_ANDROID_SUBSCRIPTIONS:
        raise HTTPException(status_code=400, detail="Unsupported subscription product.")
    if not purchase_token:
        raise HTTPException(status_code=400, detail="Missing purchase token.")

    verified_package_name = _google_package_name(package_name)
    token_hash = hash_purchase_token(purchase_token)

    log_structured_event(
        "billing.google_play_verify_started",
        product_id=product_id,
        package_name=verified_package_name,
        purchase_token_sha256=token_hash,
    )

    try:
        access_token = _get_google_access_token()
        response = requests.get(
            GOOGLE_PLAY_SUBSCRIPTION_V2_URL.format(
                package_name=verified_package_name,
                purchase_token=purchase_token,
            ),
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
    except HTTPException:
        raise
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="billing",
            action="google_play_verify_request_failed",
            tags={"product_id": product_id},
        )
        raise HTTPException(status_code=502, detail="Could not verify subscription with Google Play.") from exc

    if response.status_code >= 400:
        capture_backend_exception(
            HTTPException(status_code=response.status_code, detail=response.text),
            feature="billing",
            action="google_play_verify_error",
            tags={"product_id": product_id, "status_code": response.status_code},
            extra={"response_preview": response.text[:500]},
        )
        raise HTTPException(status_code=400, detail="Google Play could not verify this subscription.")

    data = response.json()
    line_items = data.get("lineItems") or []
    matching_item = next(
        (item for item in line_items if item.get("productId") == product_id),
        line_items[0] if line_items else {},
    )
    verified_product_id = matching_item.get("productId") or product_id
    if verified_product_id != product_id:
        raise HTTPException(status_code=400, detail="Purchase product does not match requested product.")

    expires_at = parse_google_time(matching_item.get("expiryTime"))
    google_state = data.get("subscriptionState")
    status = _subscription_status_from_google(google_state, expires_at)
    auto_renewing = _auto_renewing_from_line_item(matching_item)
    if status in {"cancelled", "expired"} or google_state in {"SUBSCRIPTION_STATE_CANCELED", "SUBSCRIPTION_STATE_EXPIRED"}:
        auto_renewing = False
    purchase_time = parse_google_time(data.get("startTime"))
    google_order_id = (
        matching_item.get("latestSuccessfulOrderId")
        or matching_item.get("latestOrderId")
        or data.get("latestOrderId")
        or data.get("orderId")
    )

    log_structured_event(
        "billing.google_play_verify_completed",
        product_id=verified_product_id,
        package_name=verified_package_name,
        purchase_token_sha256=token_hash,
        status=status,
        active=is_subscription_pro(status, expires_at),
        auto_renewing=auto_renewing,
    )

    log_structured_event(
        "billing.google_play_verified",
        product_id=verified_product_id,
        purchase_token_sha256=token_hash,
        status=status,
        expires_at=expires_at.isoformat() if expires_at else None,
        auto_renewing=auto_renewing,
    )

    return {
        "product_id": verified_product_id,
        "status": status,
        "expires_at": expires_at,
        "purchase_time": purchase_time,
        "auto_renewing": auto_renewing,
        "active": is_subscription_pro(status, expires_at),
        "package_name": verified_package_name,
        "google_order_id": google_order_id,
        "raw_response": data,
    }


def upsert_user_subscription(
    *,
    user_id: str,
    product_id: str,
    purchase_token: str,
    package_name: str | None = None,
    transaction_id: str | None = None,
    purchase_time: datetime.datetime | None = None,
) -> dict[str, Any]:
    verified = verify_google_play_subscription(product_id, purchase_token, package_name)
    now = utcnow()
    token_hash = hash_purchase_token(purchase_token)
    log_structured_event(
        "billing.subscription_upsert_started",
        user_id=user_id,
        product_id=product_id,
        package_name=package_name,
        purchase_token_sha256=token_hash,
    )
    existing = (
        supabase.table("user_subscriptions")
        .select("*")
        .eq("purchase_token_sha256", token_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing and existing[0].get("user_id") != user_id:
        raise HTTPException(status_code=409, detail="This purchase token is already linked to another account.")

    subscription_state_before = existing[0] if existing else {}
    log_structured_event(
        "billing.subscription_state_before",
        user_id=user_id,
        purchase_token_sha256=token_hash,
        status=subscription_state_before.get("status") if isinstance(subscription_state_before, dict) else None,
        active=subscription_state_before.get("active") if isinstance(subscription_state_before, dict) else None,
        auto_renewing=subscription_state_before.get("auto_renewing") if isinstance(subscription_state_before, dict) else None,
    )

    verified_purchase_time = purchase_time or verified.get("purchase_time")
    payload = {
        "user_id": user_id,
        "plan_type": "pro",
        "subscription_id": verified["product_id"],
        "product_id": verified["product_id"],
        "purchase_token": purchase_token,
        "purchase_token_sha256": token_hash,
        "transaction_id": transaction_id or verified.get("google_order_id"),
        "package_name": verified["package_name"],
        "platform": "android",
        "status": verified["status"],
        "expires_at": verified["expires_at"].isoformat() if verified["expires_at"] else None,
        "expiry_date": verified["expires_at"].isoformat() if verified["expires_at"] else None,
        "purchase_time": verified_purchase_time.isoformat() if verified_purchase_time else None,
        "purchase_date": verified_purchase_time.isoformat() if verified_purchase_time else None,
        "auto_renewing": verified["auto_renewing"],
        "active": verified["active"],
        "verified_at": now.isoformat(),
        # "raw_response": verified["raw_response"],
        "updated_at": now.isoformat(),
    }

    try:
        result = (
            supabase.rpc("upsert_subscription_transaction", {"payload": payload})
            .execute()
        )
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="billing",
            action="supabase_subscription_upsert_failed",
            tags={"product_id": product_id},
            extra={"user_id": user_id, "purchase_token_sha256": token_hash},
        )
        raise
    
    subscription_state_after = result.data if result.data else payload
    log_structured_event(
        "billing.subscription_state_after",
        user_id=user_id,
        purchase_token_sha256=token_hash,
        status=subscription_state_after.get("status") if isinstance(subscription_state_after, dict) else None,
        active=subscription_state_after.get("active") if isinstance(subscription_state_after, dict) else None,
        auto_renewing=subscription_state_after.get("auto_renewing") if isinstance(subscription_state_after, dict) else None,
    )
    log_structured_event(
        "billing.subscription_updated",
        user_id=user_id,
        purchase_token_sha256=token_hash,
        status=verified["status"],
        active=verified["active"],
    )
    # The RPC already updates users.plan_type, so we skip calling update_user_plan_type(user_id)
    log_structured_event(
        "billing.subscription_upsert_completed",
        user_id=user_id,
        product_id=verified["product_id"],
        purchase_token_sha256=token_hash,
        status=verified["status"],
        active=verified["active"],
    )
    return subscription_state_after


def is_subscription_pro(status: str | None, expires_at: str | datetime.datetime | None) -> bool:
    if status not in {"active", "cancelled", "in_grace_period"}:
        return False
    if not expires_at:
        return status in {"active", "in_grace_period"}
    parsed = parse_google_time(expires_at) if isinstance(expires_at, str) else expires_at
    if parsed and parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return bool(parsed and parsed > utcnow())


def _active_from_status(status: str | None, expires_at: datetime.datetime | None) -> bool:
    return is_subscription_pro(status, expires_at)


def record_billing_event(
    *,
    package_name: str | None,
    product_id: str | None,
    purchase_token: str | None,
    event_type: str,
    event_time: datetime.datetime | None = None,
    raw_payload: dict[str, Any] | None = None,
) -> None:
    payload = {
        "package_name": package_name,
        "product_id": product_id,
        "purchase_token_sha256": hash_purchase_token(purchase_token) if purchase_token else None,
        "event_type": event_type,
        "event_time": event_time.isoformat() if event_time else None,
        "raw_payload": raw_payload or {},
    }
    try:
        supabase.table("billing_events").insert(payload).execute()
    except Exception as exc:
        log_structured_event("billing.event_record_failed", event_type=event_type, error=str(exc))


def sync_subscription_from_google_notification(
    *,
    package_name: str,
    product_id: str,
    purchase_token: str,
    notification_type: str,
    raw_payload: dict[str, Any],
    event_time: datetime.datetime | None = None,
) -> dict[str, Any] | None:
    print("SYNC STEP 1")
    verified = verify_google_play_subscription(product_id, purchase_token, package_name)
    token_hash = hash_purchase_token(purchase_token)
    print("SYNC STEP 2")
    
    log_structured_event(
        "billing.google_play_verified",
        product_id=product_id,
        purchase_token_sha256=token_hash,
        status=verified["status"],
        expires_at=verified["expires_at"].isoformat() if verified["expires_at"] else None,
        auto_renewing=verified["auto_renewing"],
    )

    rows = (
        supabase.table("user_subscriptions")
        .select("*")
        .eq("purchase_token_sha256", token_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    record_billing_event(
        package_name=package_name,
        product_id=product_id,
        purchase_token=purchase_token,
        event_type=notification_type,
        event_time=event_time,
        raw_payload=raw_payload,
    )
    print("SYNC STEP 3")
    
    user_id = None
    is_new = False
    
    if rows:
        user_id = rows[0]["user_id"]
        subscription_state_before = rows[0]
    else:
        # Fallback: check Google Play's obfuscated account identifiers
        clerk_user_id = None
        raw_resp = verified.get("raw_response") or {}
        ext_ids = raw_resp.get("externalAccountIdentifiers")
        if isinstance(ext_ids, dict):
            clerk_user_id = ext_ids.get("obfuscatedExternalAccountId")
            
        if clerk_user_id:
            user_rows = (
                supabase.table("users")
                .select("user_id")
                .eq("clerk_user_id", clerk_user_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if user_rows:
                user_id = user_rows[0]["user_id"]
                is_new = True
                subscription_state_before = {}
                log_structured_event(
                    "billing.rtdn_matched_via_obfuscated_id",
                    clerk_user_id=clerk_user_id,
                    user_id=user_id,
                    purchase_token_sha256=token_hash,
                )

    if not user_id:
        log_structured_event(
            "billing.rtdn_unmatched_purchase_token",
            package_name=package_name,
            product_id=product_id,
            notification_type=notification_type,
            purchase_token_sha256=token_hash,
        )
        return None

    now = utcnow()
    purchase_time = verified.get("purchase_time")
    payload = {
        "user_id": user_id,
        "plan_type": "pro",
        "subscription_id": verified["product_id"],
        "product_id": verified["product_id"],
        "purchase_token": purchase_token,
        "purchase_token_sha256": token_hash,
        "transaction_id": verified.get("google_order_id"),
        "package_name": verified["package_name"],
        "platform": "android",
        "status": verified["status"],
        "expires_at": verified["expires_at"].isoformat() if verified["expires_at"] else None,
        "expiry_date": verified["expires_at"].isoformat() if verified["expires_at"] else None,
        "purchase_time": purchase_time.isoformat() if purchase_time else None,
        "purchase_date": purchase_time.isoformat() if purchase_time else None,
        "auto_renewing": verified["auto_renewing"],
        "active": _active_from_status(verified["status"], verified["expires_at"]),
        "latest_notification_type": notification_type,
        "verified_at": now.isoformat(),
        # "raw_response": verified["raw_response"],
        "updated_at": now.isoformat(),
    }
    
    log_structured_event(
        "billing.subscription_state_before",
        user_id=user_id,
        purchase_token_sha256=token_hash,
        status=subscription_state_before.get("status") if isinstance(subscription_state_before, dict) else None,
        active=subscription_state_before.get("active") if isinstance(subscription_state_before, dict) else None,
        auto_renewing=subscription_state_before.get("auto_renewing") if isinstance(subscription_state_before, dict) else None,
    )
    
    print("SYNC STEP 4")
    if is_new:
        result = (
            supabase.table("user_subscriptions")
            .insert(payload)
            .execute()
        )
    else:
        result = (
            supabase.table("user_subscriptions")
            .update(payload)
            .eq("purchase_token_sha256", token_hash)
            .execute()
        )
        
    subscription_state_after = result.data[0] if result.data else payload
    
    log_structured_event(
        "billing.subscription_state_after",
        user_id=user_id,
        purchase_token_sha256=token_hash,
        status=subscription_state_after.get("status") if isinstance(subscription_state_after, dict) else None,
        active=subscription_state_after.get("active") if isinstance(subscription_state_after, dict) else None,
        auto_renewing=subscription_state_after.get("auto_renewing") if isinstance(subscription_state_after, dict) else None,
    )
    log_structured_event(
        "billing.subscription_updated",
        user_id=user_id,
        purchase_token_sha256=token_hash,
        status=verified["status"],
        active=verified["active"],
    )
    update_user_plan_type(user_id)
    print("SYNC STEP 5")
    return subscription_state_after


def get_latest_subscription_status(user_id: str) -> dict[str, Any]:
    result = (
        supabase.table("user_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .limit(10)
        .execute()
    )
    subscriptions = result.data or []
    
    active_subscription = None
    for item in subscriptions:
        active = item.get("active") is True
        expiry = item.get("expiry_date") or item.get("expires_at")
        is_active = False
        if active:
            if not expiry:
                is_active = True
            else:
                parsed = parse_google_time(expiry) if isinstance(expiry, str) else expiry
                if parsed and parsed > utcnow():
                    is_active = True
        if is_active:
            active_subscription = item
            break

    latest = active_subscription or (subscriptions[0] if subscriptions else None)
    return {
        "is_pro": bool(active_subscription),
        "plan": "pro" if active_subscription else "free",
        "subscription": latest,
        "subscriptions_history": subscriptions,
    }


def is_pro_user(user_id: str) -> bool:
    return bool(get_latest_subscription_status(user_id)["is_pro"])


def update_user_plan_type(user_id: str) -> None:
    status = get_latest_subscription_status(user_id)
    plan_type = "pro" if status["is_pro"] else "free"
    try:
        supabase.table("users").update({"plan_type": plan_type}).eq("user_id", user_id).execute()
        log_structured_event(
            "billing.user_plan_updated",
            user_id=user_id,
            plan_type=plan_type,
        )
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="billing",
            action="supabase_user_plan_update_failed",
            tags={"plan_type": plan_type},
            extra={"user_id": user_id},
        )
        log_structured_event(
            "billing.user_plan_update_failed",
            user_id=user_id,
            plan_type=plan_type,
            error=str(exc),
        )


def get_razorpay_client():
    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        return None
    return razorpay.Client(auth=(key_id, key_secret))


def _razorpay_plan_config(plan: str) -> dict[str, Any]:
    if plan == "weekly":
        selected_plan = "weekly"
    elif plan == "yearly":
        selected_plan = "yearly"
    else:
        selected_plan = "monthly"

    weekly_plan_id = os.getenv("RAZORPAY_PRO_WEEKLY_PLAN_ID", "").strip()
    monthly_plan_id = os.getenv("RAZORPAY_PRO_MONTHLY_PLAN_ID", "").strip()
    yearly_plan_id = os.getenv("RAZORPAY_PRO_YEARLY_PLAN_ID", "").strip()
    
    weekly_count = int(os.getenv("RAZORPAY_PRO_WEEKLY_TOTAL_COUNT", "520"))
    monthly_count = int(os.getenv("RAZORPAY_PRO_MONTHLY_TOTAL_COUNT", "120"))
    yearly_count = int(os.getenv("RAZORPAY_PRO_YEARLY_TOTAL_COUNT", "10"))
    
    config = {
        "weekly": {
            "plan_id": weekly_plan_id,
            "total_count": weekly_count,
            "description": "PikaDecks Pro - Weekly Subscription",
            "product_id": "razorpay_pro_weekly",
        },
        "monthly": {
            "plan_id": monthly_plan_id,
            "total_count": monthly_count,
            "description": "PikaDecks Pro - Monthly Subscription",
            "product_id": "razorpay_pro_monthly",
        },
        "yearly": {
            "plan_id": yearly_plan_id,
            "total_count": yearly_count,
            "description": "PikaDecks Pro - Yearly Subscription",
            "product_id": "razorpay_pro_yearly",
        },
    }[selected_plan]
    
    if not config["plan_id"]:
        raise HTTPException(
            status_code=500, 
            detail=f"Razorpay plan ID for '{selected_plan}' subscription is not configured."
        )
    return config


def _razorpay_time(value: Any) -> datetime.datetime | None:
    if not value:
        return None
    try:
        return datetime.datetime.fromtimestamp(int(value), datetime.timezone.utc).replace(microsecond=0)
    except (TypeError, ValueError, OSError):
        return parse_google_time(value) if isinstance(value, str) else None


def _razorpay_subscription_status(entity: dict[str, Any]) -> str:
    status = str(entity.get("status") or "created").lower()
    status_mapping = {
        "created": "pending",
        "authenticated": "active",
        "active": "active",
        "paused": "on_hold",
        "halted": "on_hold",
        "cancelled": "cancelled",
        "completed": "expired",
        "expired": "expired"
    }
    return status_mapping.get(status, "unknown")


def _razorpay_subscription_expiry(entity: dict[str, Any], plan: str) -> datetime.datetime:
    current_end = _razorpay_time(entity.get("current_end"))
    if current_end:
        return current_end
    charge_at = _razorpay_time(entity.get("charge_at"))
    if charge_at:
        return charge_at
    now = utcnow()
    if plan == "weekly":
        return now + datetime.timedelta(days=7)
    elif plan == "yearly":
        return now + datetime.timedelta(days=365)
    else:
        return now + datetime.timedelta(days=30)


def _upsert_razorpay_subscription(
    *,
    user_id: str,
    subscription_id: str,
    payment_id: str | None,
    plan: str,
    subscription_entity: dict[str, Any],
    raw_response: dict[str, Any],
) -> dict[str, Any]:
    config = _razorpay_plan_config(plan)
    now = utcnow()
    expires_at = _razorpay_subscription_expiry(subscription_entity, plan)
    status = _razorpay_subscription_status(subscription_entity)
    if payment_id and status == "pending":
        status = "active"
    active = _active_from_status(status, expires_at)
    token_hash = hash_purchase_token(subscription_id)
    start_at = _razorpay_time(subscription_entity.get("start_at")) or now

    payload = {
        "user_id": user_id,
        "plan_type": "pro",
        "subscription_id": subscription_id,
        "product_id": config["product_id"],
        "purchase_token": subscription_id,
        "purchase_token_sha256": token_hash,
        "transaction_id": payment_id,
        "platform": "razorpay",
        "status": status,
        "expires_at": expires_at.isoformat(),
        "expiry_date": expires_at.isoformat(),
        "purchase_time": start_at.isoformat(),
        "purchase_date": start_at.isoformat(),
        "auto_renewing": status not in {"cancelled", "completed", "expired", "halted", "paused"},
        "active": active,
        "verified_at": now.isoformat(),
        "raw_response": raw_response,
        "updated_at": now.isoformat(),
    }

    try:
        supabase.table("user_subscriptions").upsert(payload, on_conflict="purchase_token_sha256").execute()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="billing",
            action="razorpay_subscription_upsert_failed",
            tags={
                "subscription_id": subscription_id,
                "payment_id": payment_id,
                "razorpay_status": subscription_entity.get("status"),
                "mapped_internal_status": status,
            },
            extra={"user_id": user_id},
        )
        raise

    update_user_plan_type(user_id)
    return payload


def create_razorpay_subscription(user_id: str, plan: str = "monthly") -> dict[str, Any]:
    """Create a Razorpay subscription for Checkout."""
    client = get_razorpay_client()
    if not client:
        raise HTTPException(status_code=500, detail="Razorpay is not configured.")

    if plan == "weekly":
        selected_plan = "weekly"
    elif plan == "yearly":
        selected_plan = "yearly"
    else:
        selected_plan = "monthly"

    config = _razorpay_plan_config(selected_plan)

    try:
        with trace_span(
            op="razorpay.create_subscription",
            description=f"Razorpay Create Subscription - {selected_plan}",
            tags={"user_id": user_id, "payment_provider": "razorpay", "operation_type": "subscription_creation"},
            data={"plan_id": config["plan_id"]}
        ):
            subscription = client.subscription.create({
                "plan_id": config["plan_id"],
                "total_count": config["total_count"],
                "quantity": 1,
                "customer_notify": 1,
                "notes": {
                    "user_id": user_id,
                    "plan": selected_plan,
                },
            })
        log_structured_event(
            "billing.razorpay_subscription_created",
            user_id=user_id,
            subscription_id=subscription["id"],
            plan=selected_plan,
        )
        return {
            "provider": "razorpay",
            "subscription_id": subscription["id"],
            "key_id": os.getenv("RAZORPAY_KEY_ID"),
            "description": config["description"],
        }
    except Exception as exc:
        capture_backend_exception(exc, feature="billing", action="razorpay_subscription_create_failed", tags={"user_id": user_id})
        raise HTTPException(status_code=502, detail="Failed to create Razorpay subscription.") from exc


def verify_razorpay_subscription_payment(
    *,
    user_id: str,
    razorpay_subscription_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
    plan: str = "monthly",
) -> dict[str, Any]:
    """Verify Razorpay subscription checkout signature and activate Pro."""
    import hmac

    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if not key_secret:
        raise HTTPException(status_code=500, detail="Razorpay is not configured.")

    message = f"{razorpay_payment_id}|{razorpay_subscription_id}"
    generated_signature = hmac.new(
        key_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(generated_signature, razorpay_signature):
        log_structured_event(
            "billing.razorpay_subscription_signature_mismatch",
            user_id=user_id,
            subscription_id=razorpay_subscription_id,
            payment_id=razorpay_payment_id,
        )
        raise HTTPException(status_code=400, detail="Payment verification failed. Invalid signature.")

    client = get_razorpay_client()
    with trace_span(
        op="razorpay.verify_payment",
        description="Verify Razorpay Payment and Activate",
        tags={
            "user_id": user_id,
            "payment_provider": "razorpay",
            "operation_type": "payment_capture",
            "subscription_plan": plan
        },
        data={
            "subscription_id": razorpay_subscription_id,
            "payment_id": razorpay_payment_id
        }
    ):
        subscription_entity = client.subscription.fetch(razorpay_subscription_id) if client else {}
        payload = _upsert_razorpay_subscription(
            user_id=user_id,
            subscription_id=razorpay_subscription_id,
            payment_id=razorpay_payment_id,
            plan=plan,
            subscription_entity=subscription_entity,
            raw_response={
                "subscription": subscription_entity,
                "payment_id": razorpay_payment_id,
                "plan": plan,
            },
        )

    return {
        "success": True,
        "is_pro": payload["active"],
        "plan": "pro",
        "payment_id": razorpay_payment_id,
        "subscription_id": razorpay_subscription_id,
    }


def create_razorpay_order(user_id: str, plan: str = "monthly") -> dict[str, Any]:
    """Create a one-time Razorpay order for Standard Checkout."""
    client = get_razorpay_client()
    if not client:
        raise HTTPException(status_code=500, detail="Razorpay is not configured.")

    # Plan pricing in paise (100 paise = ₹1)
    plan_config = {
        "weekly": {"amount": 100, "receipt": "pikadecks_pro_weekly", "description": "PikaDecks Pro - 7-Day Pass"},
        "monthly": {"amount": 400, "receipt": "pikadecks_pro_monthly", "description": "PikaDecks Pro - 30-Day Pass"},
        "yearly": {"amount": 199900, "receipt": "pikadecks_pro_yearly", "description": "PikaDecks Pro - 1-Year Pass"},
    }
    config = plan_config.get(plan, plan_config["monthly"])

    try:
        order = client.order.create({
            "amount": config["amount"],
            "currency": "INR",
            "receipt": f"{config['receipt']}_{user_id[:8]}",
            "notes": {
                "user_id": user_id,
                "plan": plan,
            }
        })
        log_structured_event(
            "billing.razorpay_order_created",
            user_id=user_id,
            order_id=order["id"],
            amount=config["amount"],
            plan=plan,
        )
        return {
            "provider": "razorpay",
            "order_id": order["id"],
            "amount": config["amount"],
            "currency": "INR",
            "key_id": os.getenv("RAZORPAY_KEY_ID"),
            "description": config["description"],
        }
    except Exception as exc:
        capture_backend_exception(exc, feature="billing", action="razorpay_order_create_failed", tags={"user_id": user_id})
        raise HTTPException(status_code=502, detail="Failed to create Razorpay order.") from exc


def verify_razorpay_payment(
    *,
    user_id: str,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
    plan: str = "monthly",
) -> dict[str, Any]:
    """Verify Razorpay payment signature using HMAC-SHA256 and activate one-time Pro access."""
    import hmac

    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if not key_secret:
        raise HTTPException(status_code=500, detail="Razorpay is not configured.")

    # Verify signature: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    message = f"{razorpay_order_id}|{razorpay_payment_id}"
    generated_signature = hmac.new(
        key_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(generated_signature, razorpay_signature):
        log_structured_event(
            "billing.razorpay_signature_mismatch",
            user_id=user_id,
            order_id=razorpay_order_id,
            payment_id=razorpay_payment_id,
        )
        raise HTTPException(status_code=400, detail="Payment verification failed. Invalid signature.")

    log_structured_event(
        "billing.razorpay_payment_verified",
        user_id=user_id,
        order_id=razorpay_order_id,
        payment_id=razorpay_payment_id,
        plan=plan,
    )

    # Determine expiry based on the one-time access pass.
    now = utcnow()
    if plan == "weekly":
        expires_at = now + datetime.timedelta(days=7)
    elif plan == "yearly":
        expires_at = now + datetime.timedelta(days=365)
    else:
        expires_at = now + datetime.timedelta(days=30)

    token_hash = hash_purchase_token(razorpay_order_id)

    payload = {
        "user_id": user_id,
        "plan_type": "pro",
        "subscription_id": razorpay_order_id,
        "product_id": f"razorpay_pro_{plan}",
        "purchase_token": razorpay_order_id,
        "purchase_token_sha256": token_hash,
        "transaction_id": razorpay_payment_id,
        "platform": "razorpay",
        "status": "active",
        "expires_at": expires_at.isoformat(),
        "expiry_date": expires_at.isoformat(),
        "purchase_time": now.isoformat(),
        "purchase_date": now.isoformat(),
        "auto_renewing": False,
        "active": True,
        "verified_at": now.isoformat(),
        "raw_response": {
            "order_id": razorpay_order_id,
            "payment_id": razorpay_payment_id,
            "plan": plan,
        },
        "updated_at": now.isoformat(),
    }

    try:
        supabase.table("user_subscriptions").upsert(payload, on_conflict="purchase_token_sha256").execute()
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="billing",
            action="razorpay_subscription_upsert_failed",
            tags={"order_id": razorpay_order_id},
            extra={"user_id": user_id},
        )
        raise

    update_user_plan_type(user_id)

    return {
        "success": True,
        "is_pro": True,
        "plan": "pro",
        "payment_id": razorpay_payment_id,
        "order_id": razorpay_order_id,
    }


def _safe_get_notes(entity: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(entity, dict):
        return {}
    notes = entity.get("notes")
    if isinstance(notes, dict):
        return notes
    return {}


def sync_subscription_from_razorpay_webhook(payload: dict[str, Any], event_type: str) -> dict[str, Any] | None:
    """Handle Razorpay webhook events (payment.captured, payment.failed)."""
    with trace_span(
        op="razorpay.webhook",
        description=f"Razorpay Webhook - {event_type}",
        tags={"payment_provider": "razorpay", "operation_type": "webhook", "event_type": event_type}
    ) as span:
        subscription_entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
        if subscription_entity:
            subscription_id = subscription_entity.get("id")
            notes = _safe_get_notes(subscription_entity)
            user_id = notes.get("user_id")
            plan = notes.get("plan", "monthly")
            payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
            payment_id = payment_entity.get("id") if isinstance(payment_entity, dict) else None

            if user_id:
                span.set_tag("user_id", str(user_id))
            if subscription_id:
                span.set_data("subscription_id", subscription_id)

            if not user_id and subscription_id:
                token_hash = hash_purchase_token(subscription_id)
                existing = supabase.table("user_subscriptions").select("user_id").eq("purchase_token_sha256", token_hash).limit(1).execute().data
                if existing:
                    user_id = existing[0]["user_id"]
                    span.set_tag("user_id", str(user_id))

            if not user_id or not subscription_id:
                log_structured_event("billing.razorpay_subscription_webhook_no_user", subscription_id=subscription_id, event_type=event_type)
                return None

            return _upsert_razorpay_subscription(
                user_id=user_id,
                subscription_id=subscription_id,
                payment_id=payment_id,
                plan=plan,
                subscription_entity=subscription_entity,
                raw_response=payload,
            )

    if event_type not in ["payment.captured", "payment.failed", "order.paid"]:
        return None

    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    if isinstance(payment_entity, list):
        payment_entity = payment_entity[0] if payment_entity else {}

    order_id = payment_entity.get("order_id") if isinstance(payment_entity, dict) else None
    payment_id = payment_entity.get("id") if isinstance(payment_entity, dict) else None
    notes = _safe_get_notes(payment_entity) if isinstance(payment_entity, dict) else {}
    user_id = notes.get("user_id")

    if not order_id or not payment_id:
        return None

    if event_type == "payment.failed":
        log_structured_event(
            "billing.razorpay_payment_failed_webhook",
            order_id=order_id,
            payment_id=payment_id,
            user_id=user_id,
        )
        return {"event": "payment.failed", "order_id": order_id}

    # payment.captured or order.paid — activate subscription
    if not user_id:
        # Try to find user from existing order
        token_hash = hash_purchase_token(order_id)
        existing = supabase.table("user_subscriptions").select("user_id").eq("purchase_token_sha256", token_hash).limit(1).execute().data
        if existing:
            user_id = existing[0]["user_id"]
        else:
            log_structured_event("billing.razorpay_webhook_no_user", order_id=order_id, payment_id=payment_id)
            return None

    plan = notes.get("plan", "monthly")
    now = utcnow()
    if plan == "weekly":
        expires_at = now + datetime.timedelta(days=7)
    elif plan == "yearly":
        expires_at = now + datetime.timedelta(days=365)
    else:
        expires_at = now + datetime.timedelta(days=30)

    token_hash = hash_purchase_token(order_id)

    upsert_payload = {
        "user_id": user_id,
        "plan_type": "pro",
        "subscription_id": order_id,
        "product_id": f"razorpay_pro_{plan}",
        "purchase_token": order_id,
        "purchase_token_sha256": token_hash,
        "transaction_id": payment_id,
        "platform": "razorpay",
        "status": "active",
        "expires_at": expires_at.isoformat(),
        "expiry_date": expires_at.isoformat(),
        "purchase_time": now.isoformat(),
        "purchase_date": now.isoformat(),
        "auto_renewing": False,
        "active": True,
        "verified_at": now.isoformat(),
        "raw_response": payload,
        "updated_at": now.isoformat(),
    }

    supabase.table("user_subscriptions").upsert(upsert_payload, on_conflict="purchase_token_sha256").execute()
    update_user_plan_type(user_id)
    return upsert_payload


def get_razorpay_plans_details() -> dict[str, Any]:
    client = get_razorpay_client()
    
    plans_to_fetch = {
        "weekly": os.getenv("RAZORPAY_PRO_WEEKLY_PLAN_ID", "").strip(),
        "monthly": os.getenv("RAZORPAY_PRO_MONTHLY_PLAN_ID", "").strip(),
        "yearly": os.getenv("RAZORPAY_PRO_YEARLY_PLAN_ID", "").strip(),
    }
    
    details = {}
    for plan_key, plan_id in plans_to_fetch.items():
        if not plan_id:
            continue
        try:
            if client:
                plan_data = client.plan.fetch(plan_id)
                item = plan_data.get("item") or {}
                amount_paise = item.get("amount") or 0
                details[plan_key] = {
                    "plan_id": plan_id,
                    "amount": amount_paise / 100.0,
                    "currency": item.get("currency", "INR"),
                    "name": item.get("name"),
                    "description": item.get("description"),
                }
            else:
                raise ValueError("Razorpay client is not initialized")
        except Exception as exc:
            # Fallback values if API fetch fails or client not configured
            default_prices = {"weekly": 49, "monthly": 199, "yearly": 1999}
            details[plan_key] = {
                "plan_id": plan_id,
                "amount": default_prices.get(plan_key, 0),
                "currency": "INR",
                "name": f"PikaDecks Pro {plan_key.capitalize()}",
                "description": f"PikaDecks Pro - {plan_key.capitalize()} Subscription",
                "error": str(exc)
            }
    return details


