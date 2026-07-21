import base64
import json
import os

import firebase_admin
from firebase_admin import credentials
from firebase_admin import messaging
from app.credentials import load_packaged_credential

from app.observability import log_structured_event, capture_backend_exception

def _validate_service_account(data: any) -> bool:
    if not isinstance(data, dict):
        return False
    return (
        data.get("type") == "service_account"
        and "project_id" in data
        and "private_key" in data
        and "client_email" in data
    )

def _load_service_account():
    # 1. Try FCM_SERVICE_ACCOUNT_JSON (firebase-service-account.json)
    fcm_data = None
    try:
        fcm_data = load_packaged_credential("firebase-service-account.json")
        if _validate_service_account(fcm_data):
            log_structured_event("fcm.credentials.valid", source="FCM_SERVICE_ACCOUNT_JSON")
            return fcm_data
        else:
            log_structured_event(
                "fcm.credentials.invalid_format",
                keys=list(fcm_data.keys()) if isinstance(fcm_data, dict) else None,
                message="FCM_SERVICE_ACCOUNT_JSON is not a valid service_account certificate"
            )
    except Exception as exc:
        log_structured_event("fcm.credentials.load_error", error=str(exc))

    # 2. Try falling back to GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (google-play-service-account.json)
    log_structured_event("fcm.credentials.fallback_attempt", target="GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
    try:
        play_data = load_packaged_credential("google-play-service-account.json")
        if _validate_service_account(play_data):
            log_structured_event("fcm.credentials.fallback_success", source="GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
            return play_data
        else:
            log_structured_event(
                "fcm.credentials.fallback_invalid",
                keys=list(play_data.keys()) if isinstance(play_data, dict) else None,
                message="GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not a valid service_account certificate"
            )
    except Exception as exc:
        log_structured_event("fcm.credentials.fallback_error", error=str(exc))

    raise RuntimeError("FCM_SERVICE_ACCOUNT_JSON is required for notification delivery (and fallback to GOOGLE_PLAY_SERVICE_ACCOUNT_JSON failed)")


def initialize_firebase(service_account_dict=None):
    if not firebase_admin._apps:
        if service_account_dict and _validate_service_account(service_account_dict):
            cred = credentials.Certificate(service_account_dict)
        else:
            if service_account_dict:
                log_structured_event(
                    "fcm.initialize.passed_dict_invalid",
                    keys=list(service_account_dict.keys()) if isinstance(service_account_dict, dict) else None
                )
            cred_dict = _load_service_account()
            cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)

def send_push(token, title, body, data=None):
    payload_data = {
        "title": str(title),
        "body": str(body),
    }
    for key, value in (data or {}).items():
        payload_data[str(key)] = str(value)

    message = messaging.Message(
        android=messaging.AndroidConfig(
            priority="high",
        ),
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(
                    alert=messaging.ApsAlert(
                        title=str(title),
                        body=str(body),
                    ),
                    sound="default",
                    content_available=True,
                )
            )
        ),
        notification=messaging.Notification(
            title=str(title),
            body=str(body),
        ),
        data=payload_data,
        token=token
    )
    return messaging.send(message)


def is_unregistered_token_error(exc):
    error_text = str(exc).lower()
    error_type = type(exc).__name__.lower()
    return (
        "unregistered" in error_text
        or "requested entity was not found" in error_text
        or "registration-token-not-registered" in error_text
        or "unregistered" in error_type
    )
