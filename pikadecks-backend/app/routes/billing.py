import datetime
import base64
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.dependencies import get_current_user
from app.observability import capture_backend_exception, log_structured_event
from app.database import supabase
from app.services.billing import (
    get_app_user_id,
    get_latest_subscription_status,
    is_billing_enabled,
    is_pro_user,
    parse_google_time,
    record_billing_event,
    sync_subscription_from_google_notification,
    upsert_user_subscription,
    create_razorpay_subscription,
    verify_razorpay_subscription_payment,
    sync_subscription_from_razorpay_webhook,
    get_razorpay_plans_details,
)


router = APIRouter(prefix="/billing", tags=["billing"])


class VerifySubscriptionRequest(BaseModel):
    productId: str = Field(..., min_length=1)
    purchaseToken: str = Field(..., min_length=1)
    packageName: str = Field(..., min_length=1)
    transactionId: str | None = None
    purchaseTime: datetime.datetime | None = None


class PubSubMessage(BaseModel):
    data: str | None = None
    messageId: str | None = None
    publishTime: str | None = None


class GooglePlayRtdnRequest(BaseModel):
    message: PubSubMessage
    subscription: str | None = None


def _current_app_user_id(current_user: dict) -> str:
    return get_app_user_id(current_user["sub"])


def _require_rtdn_secret(x_pikadecks_rtdn_secret: str | None) -> None:
    return


def _verify_oidc_token(authorization: str | None, request: Request | None = None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")

    token = authorization.split("Bearer ")[1].strip()

    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests

    EXPECTED_AUDIENCE = "https://zxd2zncyzh.execute-api.ap-south-1.amazonaws.com/billing/google-play/rtdn"
    EXPECTED_EMAIL = os.getenv("GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT")

    if not EXPECTED_EMAIL:
        raise HTTPException(status_code=500, detail="Server configuration error: GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT is not set.")

    audiences_to_try = [EXPECTED_AUDIENCE]
    if request:
        audiences_to_try.append(str(request.url))
        # Support stripping /rtdn trailing slash if any
        url_str = str(request.url)
        if url_str.endswith("/"):
            audiences_to_try.append(url_str[:-1])
    
    env_aud = os.getenv("GOOGLE_PLAY_RTDN_AUDIENCE")
    if env_aud:
        audiences_to_try.insert(0, env_aud)

    claims = None
    last_exc = None
    for aud in audiences_to_try:
        try:
            claims = id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                audience=aud,
            )
            break
        except Exception as exc:
            last_exc = exc

    if not claims:
        log_structured_event("billing.google_play_rtdn_jwt_failed", error=str(last_exc))
        raise HTTPException(status_code=401, detail=f"Token verification failed: {last_exc}")

    # Temporary logging to discover the exact service account email
    log_structured_event(
        "billing.rtdn_jwt_claims_temp",
        email=claims.get("email"),
        aud=claims.get("aud"),
        iss=claims.get("iss"),
        sub=claims.get("sub"),
    )

    log_structured_event(
        "billing.google_play_rtdn_jwt_success",
        expected_email=EXPECTED_EMAIL,
        received_email=claims.get("email"),
    )

    if claims.get("email") != EXPECTED_EMAIL:
        raise HTTPException(status_code=403, detail="Unauthorized service account.")


def _decode_pubsub_data(data: str | None) -> dict:
    if not data:
        raise HTTPException(status_code=400, detail="Missing Pub/Sub message data.")
    try:
        import json

        return json.loads(base64.b64decode(data).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Pub/Sub message data.") from exc


def _google_event_time(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    try:
        millis = int(value)
    except ValueError:
        return parse_google_time(value)
    return datetime.datetime.utcfromtimestamp(millis / 1000).replace(microsecond=0)


@router.post("/verify-subscription")
def verify_subscription(
    request: VerifySubscriptionRequest,
    current_user: dict = Depends(get_current_user),
):
    if not is_billing_enabled():
        return {
            "success": False,
            "is_pro": False,
            "plan": "free",
            "subscription": None,
            "billing_enabled": False,
            "message": "Billing is not enabled for this environment.",
        }
    user_id = _current_app_user_id(current_user)
    log_structured_event(
        "billing.verify_subscription_request",
        user_id=user_id,
        product_id=request.productId,
        package_name=request.packageName,
    )
    try:
        subscription = upsert_user_subscription(
            user_id=user_id,
            product_id=request.productId,
            purchase_token=request.purchaseToken,
            package_name=request.packageName,
            transaction_id=request.transactionId,
            purchase_time=request.purchaseTime,
        )
    except HTTPException as exc:
        if exc.status_code == 500 and "Google Play service account" in str(exc.detail):
            return {
                "success": False,
                "is_pro": False,
                "plan": "free",
                "subscription": None,
                "message": "Google Play service account is not configured.",
            }
        raise
    except Exception as exc:
        capture_backend_exception(
            exc,
            feature="billing",
            action="verify_subscription_failed",
            tags={"product_id": request.productId},
            extra={"user_id": user_id, "package_name": request.packageName},
        )
        raise
    status = get_latest_subscription_status(user_id)
    log_structured_event(
        "billing.verify_subscription_response",
        user_id=user_id,
        product_id=request.productId,
        is_pro=status["is_pro"],
        plan=status["plan"],
        subscription_status=subscription.get("status"),
    )
    return {
        "success": True,
        "is_pro": status["is_pro"],
        "plan": status["plan"],
        "subscription": {
            "id": subscription.get("id"),
            "product_id": subscription.get("product_id"),
            "status": subscription.get("status"),
            "expires_at": subscription.get("expires_at"),
            "expiry_date": subscription.get("expiry_date"),
            "auto_renewing": subscription.get("auto_renewing"),
            "active": subscription.get("active"),
            "platform": subscription.get("platform"),
        },
    }


@router.post("/subscription-status")
def subscription_status(current_user: dict = Depends(get_current_user)):
    if not is_billing_enabled():
        return {
            "success": True,
            "is_pro": False,
            "plan": "free",
            "subscription": None,
            "billing_enabled": False,
        }

    user_id = _current_app_user_id(current_user)
    status = get_latest_subscription_status(user_id)
    subscription = status.get("subscription")
    log_structured_event(
        "billing.subscription_status_response",
        user_id=user_id,
        is_pro=status["is_pro"],
        plan=status["plan"],
        subscription_status=subscription.get("status") if subscription else None,
    )
    return {
        "success": True,
        "is_pro": status["is_pro"],
        "plan": status["plan"],
        "subscription": {
            "id": subscription.get("id"),
            "product_id": subscription.get("product_id"),
            "status": subscription.get("status"),
            "expires_at": subscription.get("expires_at"),
            "expiry_date": subscription.get("expiry_date"),
            "auto_renewing": subscription.get("auto_renewing"),
            "active": subscription.get("active"),
            "platform": subscription.get("platform"),
        } if subscription else None,
    }


@router.post("/google-play/rtdn")
def google_play_rtdn(
    request: GooglePlayRtdnRequest,
    raw_request: Request,
    authorization: str | None = Header(default=None),
    x_pikadecks_rtdn_secret: str | None = Header(default=None),
):
    log_structured_event(
        "billing.google_play_rtdn_received",
        message_id=request.message.messageId,
        publish_time=request.message.publishTime,
    )
    # Authenticate via secret token first, then fallback to OIDC
    secret_in_env = os.getenv("GOOGLE_PLAY_RTDN_SECRET")
    secret_in_header = x_pikadecks_rtdn_secret
    secret_in_query = raw_request.query_params.get("secret") or raw_request.query_params.get("token")

    authenticated = False
    if secret_in_env and (secret_in_header == secret_in_env or secret_in_query == secret_in_env):
        authenticated = True
        log_structured_event("billing.google_play_rtdn_authenticated_via_secret")

    if not authenticated:
        try:
            _verify_oidc_token(authorization, raw_request)
            log_structured_event("billing.google_play_rtdn_authenticated_via_oidc")
        except Exception as exc:
            log_structured_event("billing.google_play_rtdn_auth_failed", error=str(exc))
            raise
    try:
        payload = _decode_pubsub_data(request.message.data)
        
        # Idempotency check: prevent duplicate processing using dedicated table
        message_id = request.message.messageId
        if message_id:
            subscription_notification = payload.get("subscriptionNotification") or {}
            event_type = str(subscription_notification.get("notificationType") or "unknown")
            
            purchase_token_hash = None
            raw_purchase_token = subscription_notification.get("purchaseToken")
            if raw_purchase_token:
                import hashlib
                purchase_token_hash = hashlib.sha256(raw_purchase_token.encode("utf-8")).hexdigest()
                
            try:
                supabase.table("processed_pubsub_messages").insert({
                    "message_id": message_id,
                    "event_type": event_type,
                    "purchase_token_hash": purchase_token_hash
                }).execute()
            except Exception as exc:
                # PostgreSQL unique violation (code 23505) indicates duplicate
                if "duplicate key" in str(exc).lower() or "23505" in str(exc) or "conflict" in str(exc).lower():
                    log_structured_event("billing.google_play_rtdn_duplicate_ignored", message_id=message_id)
                    return {"success": True, "ignored": True, "reason": "duplicate_message_id"}
                raise

        package_name = payload.get("packageName")
        event_time = _google_event_time(payload.get("eventTimeMillis") or request.message.publishTime)

        subscription_notification = payload.get("subscriptionNotification")
        if subscription_notification:
            product_id = subscription_notification.get("subscriptionId")
            purchase_token = subscription_notification.get("purchaseToken")
            notification_type = str(subscription_notification.get("notificationType") or "unknown")
            if not package_name or not product_id or not purchase_token:
                raise HTTPException(status_code=400, detail="Incomplete subscription notification.")
            updated = sync_subscription_from_google_notification(
                package_name=package_name,
                product_id=product_id,
                purchase_token=purchase_token,
                notification_type=notification_type,
                raw_payload=payload,
                event_time=event_time,
            )
            return {"success": True, "matched_subscription": bool(updated)}

        record_billing_event(
            package_name=package_name,
            product_id=None,
            purchase_token=None,
            event_type="non_subscription_notification",
            event_time=event_time,
            raw_payload=payload,
        )
        return {"success": True, "ignored": True}
    except HTTPException as exc:
        if exc.status_code == 500 and "Google Play service account" in str(exc.detail):
            return {"success": False, "error": "Google Play service account is not configured."}
        raise


# ── Razorpay Standard Checkout ──────────────────────────────────────────────


class CreateSubscriptionRequest(BaseModel):
    plan: str = "monthly"  # "monthly" or "yearly"


class VerifyRazorpaySubscriptionRequest(BaseModel):
    razorpay_subscription_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan: str = "monthly"


@router.post("/web/create-subscription")
def web_create_subscription(request: CreateSubscriptionRequest, current_user: dict = Depends(get_current_user)):
    """Create a Razorpay subscription for Checkout."""
    if not is_billing_enabled():
        raise HTTPException(status_code=503, detail="Billing is not enabled.")
    user_id = _current_app_user_id(current_user)
    if is_pro_user(user_id):
        raise HTTPException(
            status_code=400,
            detail="You already have an active PikaDecks Pro subscription."
        )
    return create_razorpay_subscription(user_id, request.plan)


@router.post("/web/verify-subscription")
def web_verify_subscription(request: VerifyRazorpaySubscriptionRequest, current_user: dict = Depends(get_current_user)):
    """Verify Razorpay subscription checkout signature and activate Pro."""
    if not is_billing_enabled():
        raise HTTPException(status_code=503, detail="Billing is not enabled.")
    user_id = _current_app_user_id(current_user)
    return verify_razorpay_subscription_payment(
        user_id=user_id,
        razorpay_subscription_id=request.razorpay_subscription_id,
        razorpay_payment_id=request.razorpay_payment_id,
        razorpay_signature=request.razorpay_signature,
        plan=request.plan,
    )


@router.post("/razorpay/webhook")
async def razorpay_webhook(request: Request):
    """Razorpay webhook handler for payment.captured / payment.failed events."""
    payload_body = await request.body()
    sig_header = request.headers.get("x-razorpay-signature")
    webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET")

    if webhook_secret and sig_header:
        try:
            import razorpay
            client = razorpay.Client(auth=(os.getenv("RAZORPAY_KEY_ID", ""), os.getenv("RAZORPAY_KEY_SECRET", "")))
            client.utility.verify_webhook_signature(payload_body.decode("utf-8"), sig_header, webhook_secret)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid signature")

    import json
    payload = json.loads(payload_body)
    event_type = payload.get("event")

    sync_subscription_from_razorpay_webhook(payload, event_type)
    return {"success": True}


@router.get("/plans")
def get_plans(current_user: dict = Depends(get_current_user)):
    return get_razorpay_plans_details()


@router.get("/status")
def get_billing_status(current_user: dict = Depends(get_current_user)):
    user_id = _current_app_user_id(current_user)
    status = get_latest_subscription_status(user_id)
    subscription = status.get("subscription")
    return {
        "success": True,
        "current_plan": status["plan"],
        "subscription_state": subscription.get("status") if subscription else "free",
        "expiration_date": subscription.get("expires_at") if subscription else None,
        "premium_entitlement": status["is_pro"],
    }


@router.get("/history")
def get_billing_history(current_user: dict = Depends(get_current_user)):
    if not is_billing_enabled():
        return {"success": True, "history": []}
    user_id = _current_app_user_id(current_user)
    status = get_latest_subscription_status(user_id)
    history = status.get("subscriptions_history") or []
    
    mapped_history = []
    for item in history:
        platform = item.get("platform")
        provider = "google_play" if platform == "android" else (platform or "razorpay")
        
        product_id = item.get("product_id") or ""
        plan_name = "Pro Monthly"
        if "yearly" in product_id:
            plan_name = "Pro Yearly"
        elif "weekly" in product_id:
            plan_name = "Pro Weekly"
            
        mapped_history.append({
            "id": item.get("id"),
            "provider": provider,
            "product_id": product_id,
            "plan_name": plan_name,
            "status": item.get("status"),
            "transaction_id": item.get("transaction_id"),
            "purchase_date": item.get("purchase_date") or item.get("purchase_time") or item.get("created_at"),
            "expiry_date": item.get("expiry_date") or item.get("expires_at"),
            "auto_renewing": item.get("auto_renewing"),
            "active": item.get("active"),
            "amount": 1999 if "yearly" in product_id else (49 if "weekly" in product_id else 199)
        })
    return {"success": True, "history": mapped_history}


@router.post("/restore")
def restore_purchases(current_user: dict = Depends(get_current_user)):
    if not is_billing_enabled():
        return {
            "success": False,
            "is_pro": False,
            "plan": "free",
            "message": "Billing is not enabled.",
        }
    user_id = _current_app_user_id(current_user)
    
    result = (
        supabase.table("user_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    subscriptions = result.data or []
    
    restored_count = 0
    for sub in subscriptions:
        if sub.get("platform") == "android":
            product_id = sub.get("product_id")
            purchase_token = sub.get("purchase_token")
            package_name = sub.get("package_name") or "com.nameisrk.pikadecks"
            if product_id and purchase_token:
                try:
                    upsert_user_subscription(
                        user_id=user_id,
                        product_id=product_id,
                        purchase_token=purchase_token,
                        package_name=package_name,
                    )
                    restored_count += 1
                except Exception as e:
                    log_structured_event(
                        "billing.restore_reverification_failed",
                        user_id=user_id,
                        product_id=product_id,
                        error=str(e)
                    )
                    
    status = get_latest_subscription_status(user_id)
    return {
        "success": True,
        "is_pro": status["is_pro"],
        "plan": status["plan"],
        "restored_count": restored_count,
        "subscription": status.get("subscription")
    }

