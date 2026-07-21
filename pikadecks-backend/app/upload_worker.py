import json

from fastapi import HTTPException

from app.runtime_config import load_runtime_config

load_runtime_config()

from app.models.uploads import UploadProcessBody
from app.observability import capture_backend_exception, init_sentry
from app.routes.uploads import notify_upload_processing_result, process_pdf, update_upload_job


init_sentry()


def _safe_error_message(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        if isinstance(exc.detail, str):
            if "LLM returned no flashcards" in exc.detail or "AI flashcard generation failed" in exc.detail:
                return "Document processing failed. Please try again later."
            return exc.detail
        if isinstance(exc.detail, dict):
            return exc.detail.get("message") or "Document processing failed. Please try again later."

    return "Document processing failed. Please try again later."


def _process_record(record: dict):
    message = json.loads(record.get("body") or "{}")
    upload_id = message["upload_id"]
    user_id = message["user_id"]

    body = UploadProcessBody(
        file_url=message["file_url"],
        file_name=message.get("file_name"),
        file_type=message.get("file_type"),
        num_cards=message.get("num_cards") or 10,
    )

    update_upload_job(upload_id, status="processing", stage="PROCESSING", progress=5)
    process_pdf(body, current_user={"user_id": user_id}, upload_id=upload_id)


def handler(event, context):
    processed = 0

    for record in event.get("Records", []):
        upload_id = None
        user_id = None

        try:
            message = json.loads(record.get("body") or "{}")
            upload_id = message.get("upload_id")
            user_id = message.get("user_id")
            _process_record(record)
            processed += 1
        except Exception as exc:
            capture_backend_exception(
                exc,
                feature="upload",
                action="sqs_upload_processing_failed",
                tags={
                    "upload_id": upload_id,
                    "user_id": user_id,
                    "component": "sqs_worker",
                },
                extra={
                    "message_id": record.get("messageId"),
                    "lambda_request_id": getattr(context, "aws_request_id", None),
                },
            )

            if upload_id:
                safe_message = _safe_error_message(exc)
                update_upload_job(
                    upload_id,
                    status="failed",
                    stage="FAILED",
                    progress=100,
                    error_code="PROCESSING_FAILED",
                    error_message=safe_message,
                )
                if user_id:
                    notify_upload_processing_result(
                        user_id,
                        upload_id,
                        status="failed",
                        error_message=safe_message,
                    )

            raise

    return {"processed": processed}
