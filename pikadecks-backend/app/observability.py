import contextvars
import json
import logging
import os
import time
from typing import Any

import sentry_sdk
from fastapi import Request
from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from starlette.middleware.base import BaseHTTPMiddleware


logger = logging.getLogger("pikadecks.observability")
logger.setLevel(logging.INFO)

SENSITIVE_KEYS = (
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
    "key",
    "dsn",
    "file_url",
    "upload_url",
    "presigned",
)


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower()
    return any(sensitive in lowered for sensitive in SENSITIVE_KEYS)


def _safe_log_value(key: str, value: Any, depth: int = 0, visited: set[int] | None = None) -> Any:
    if visited is None:
        visited = set()
    if _is_sensitive_key(key):
        return "[Filtered]"
    if depth > 8:
        return "...[Truncated: max depth reached]"
    val_id = id(value)
    if val_id in visited:
        return "...[Circular Reference]"
    if isinstance(value, str):
        if len(value) > 500:
            return f"{value[:500]}...[truncated]"
        return value
    if isinstance(value, dict):
        visited.add(val_id)
        try:
            return {item_key: _safe_log_value(item_key, item_value, depth + 1, visited) for item_key, item_value in value.items()}
        finally:
            visited.remove(val_id)
    if isinstance(value, list):
        visited.add(val_id)
        try:
            return [_safe_log_value(key, item, depth + 1, visited) for item in value[:20]]
        finally:
            visited.remove(val_id)
    return value


_logging_context = contextvars.ContextVar("_logging_context", default=False)
_capture_context = contextvars.ContextVar("_capture_context", default=False)


def log_structured_event(event: str, **fields: Any) -> None:
    if _logging_context.get():
        return
    token = _logging_context.set(True)
    try:
        safe_fields = {key: _safe_log_value(key, value) for key, value in fields.items()}
        logger.info(json.dumps({"event": event, **safe_fields}, default=str))
    except Exception:
        # Fallback to direct print if structured logging itself fails, to never block business logic
        try:
            print(f"[Fallback Log] event={event} fields={fields}")
        except Exception:
            pass
    finally:
        _logging_context.reset(token)


def log_cloudwatch_metric(
    namespace: str,
    metrics: dict[str, int | float],
    dimensions: dict[str, Any] | None = None,
    **fields: Any,
) -> None:
    safe_dimensions = {key: _safe_log_value(key, value) for key, value in (dimensions or {}).items()}
    safe_fields = {key: _safe_log_value(key, value) for key, value in fields.items()}
    metric_names = list(metrics.keys())
    logger.info(json.dumps({
        "_aws": {
            "Timestamp": int(time.time() * 1000),
            "CloudWatchMetrics": [
                {
                    "Namespace": namespace,
                    "Dimensions": [list(safe_dimensions.keys())] if safe_dimensions else [[]],
                    "Metrics": [{"Name": name, "Unit": "Milliseconds" if name.endswith("Ms") else "Count"} for name in metric_names],
                }
            ],
        },
        **safe_dimensions,
        **metrics,
        **safe_fields,
    }, default=str))


def init_sentry() -> None:
    # Silence Sentry's internal debug logs to prevent profiler/internal logging recursion loops
    logging.getLogger("sentry_sdk").setLevel(logging.WARNING)
    logging.getLogger("sentry_sdk.errors").setLevel(logging.WARNING)

    dsn = os.getenv("SENTRY_DSN", "").strip("'\" ")
    if dsn.startswith("SENTRY_DSN="):
        dsn = dsn[len("SENTRY_DSN="):].strip("'\" ")

    if not dsn:
        log_structured_event(
            "sentry.disabled",
            reason="missing_dsn",
            environment=os.getenv("SENTRY_ENVIRONMENT") or os.getenv("STAGE") or "dev",
        )
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT") or os.getenv("STAGE") or "dev",
        release=os.getenv("SENTRY_RELEASE"),
        traces_sample_rate=_float_env("SENTRY_TRACES_SAMPLE_RATE", 0.1),
        profiles_sample_rate=_float_env("SENTRY_PROFILES_SAMPLE_RATE", 0.0),
        send_default_pii=False,
        before_send=before_send_callback,
        integrations=[
            AwsLambdaIntegration(timeout_warning=True),
            FastApiIntegration(),
            StarletteIntegration(),
            LoggingIntegration(event_level=None), # Prevent logging handler from capturing events recursively
        ],
    )
    log_structured_event(
        "sentry.initialized",
        environment=os.getenv("SENTRY_ENVIRONMENT") or os.getenv("STAGE") or "dev",
        release=os.getenv("SENTRY_RELEASE"),
    )


def set_app_user_context(user: dict[str, Any]) -> None:
    user_id = user.get("user_id")
    clerk_user_id = user.get("clerk_user_id") or user.get("sub")

    if user_id or clerk_user_id:
        sentry_sdk.set_user({
            "id": str(user_id or clerk_user_id),
            "email": user.get("email"),
            "username": clerk_user_id,
        })

    if user_id:
        sentry_sdk.set_tag("user_id", str(user_id))

    if clerk_user_id:
        sentry_sdk.set_tag("clerk_user_id", str(clerk_user_id))


def capture_backend_exception(
    error: Exception,
    *,
    feature: str,
    action: str,
    tags: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    if _capture_context.get():
        return
    token = _capture_context.set(True)
    try:
        try:
            log_structured_event(
                "backend.exception",
                feature=feature,
                action=action,
                error_type=error.__class__.__name__,
                error_message=str(error),
                tags=tags or {},
                extra=extra or {},
            )
        except Exception:
            pass

        try:
            with sentry_sdk.push_scope() as scope:
                scope.set_tag("feature", feature)
                scope.set_tag("action", action)

                for key, value in (tags or {}).items():
                    if value is not None:
                        scope.set_tag(key, str(value))

                for key, value in (extra or {}).items():
                    scope.set_extra(key, value)

                sentry_sdk.capture_exception(error)

            flush_timeout = _float_env("SENTRY_FLUSH_TIMEOUT_SECONDS", 0.5)
            if flush_timeout > 0:
                sentry_sdk.flush(timeout=flush_timeout)
        except Exception as exc:
            # Fallback print if Sentry capturing fails, preventing observability from breaking business flows
            try:
                print(f"[Fallback Print] Sentry capture failed for {error.__class__.__name__}: {exc}")
            except Exception:
                pass
    finally:
        _capture_context.reset(token)


from contextlib import contextmanager

@contextmanager
def trace_span(op: str, description: str, tags: dict[str, Any] | None = None, data: dict[str, Any] | None = None):
    """Context manager to trace execution blocks using Sentry spans."""
    # Sentry SDK v2/v1 compatible span creation
    scope = sentry_sdk.Hub.current.scope
    parent_span = scope.span if scope else None
    
    if parent_span:
        span = parent_span.start_child(op=op, description=description)
    else:
        span = sentry_sdk.start_span(op=op, description=description)
        
    try:
        if tags:
            for k, v in tags.items():
                if v is not None:
                    span.set_tag(k, str(v))
        if data:
            for k, v in data.items():
                if v is not None:
                    span.set_data(k, v)
        yield span
    except Exception as exc:
        span.set_status("internal_error")
        raise exc
    finally:
        span.finish()


def before_send_callback(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Mask secrets, access tokens, and payment details from Sentry events."""
    try:
        # 1. Scrub Request Metadata
        request = event.get("request")
        if isinstance(request, dict):
            # Scrub headers
            headers = request.get("headers")
            if isinstance(headers, dict):
                for key in list(headers.keys()):
                    if _is_sensitive_key(key):
                        headers[key] = "[Filtered]"
            # Scrub cookies
            cookies = request.get("cookies")
            if isinstance(cookies, dict):
                for key in list(cookies.keys()):
                    if _is_sensitive_key(key):
                        cookies[key] = "[Filtered]"

        # 2. Scrub Exception & Message Variables
        extra = event.get("extra")
        if isinstance(extra, dict):
            for key in list(extra.keys()):
                if _is_sensitive_key(key):
                    extra[key] = "[Filtered]"

        # 3. Scrub Contexts
        contexts = event.get("contexts")
        if isinstance(contexts, dict):
            for context_name, context_data in contexts.items():
                if isinstance(context_data, dict):
                    for key in list(context_data.keys()):
                        if _is_sensitive_key(key):
                            context_data[key] = "[Filtered]"
    except Exception:
        # Do not log or raise exceptions here, as it triggers Sentry's logger,
        # creating a recursive event capture loop.
        pass
    return event


class SentryRequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        aws_context = request.scope.get("aws.context")
        aws_event = request.scope.get("aws.event") or {}

        # Set tagging strategy tags
        sentry_sdk.set_tag("http.method", request.method)
        sentry_sdk.set_tag("http.route", request.url.path)
        sentry_sdk.set_tag("endpoint", f"{request.method} {request.url.path}")
        sentry_sdk.set_tag("environment", os.getenv("SENTRY_ENVIRONMENT") or os.getenv("STAGE") or "dev")

        # Correlation IDs
        request_id = request.headers.get("x-request-id") or (
            aws_event.get("requestContext", {}).get("requestId")
            if isinstance(aws_event, dict)
            else None
        )
        if request_id:
            sentry_sdk.set_tag("request_id", str(request_id))

        # Retrieve active Sentry Trace ID
        trace_id = sentry_sdk.get_traceparent() or getattr(sentry_sdk.Hub.current.scope, "span", None)
        if trace_id:
            # extract trace id if it is a span object
            if hasattr(trace_id, "trace_id"):
                trace_id = trace_id.trace_id
            sentry_sdk.set_tag("trace_id", str(trace_id))

        upload_id = request.query_params.get("upload_id")
        deck_id = request.query_params.get("deck_id")

        if upload_id:
            sentry_sdk.set_tag("upload_id", str(upload_id))

        if deck_id:
            sentry_sdk.set_tag("deck_id", str(deck_id))

        if aws_context:
            sentry_sdk.set_tag("lambda.name", getattr(aws_context, "function_name", None))
            sentry_sdk.set_tag("aws.request_id", getattr(aws_context, "aws_request_id", None))
            sentry_sdk.set_context("lambda", {
                "function_name": getattr(aws_context, "function_name", None),
                "function_version": getattr(aws_context, "function_version", None),
                "memory_limit_in_mb": getattr(aws_context, "memory_limit_in_mb", None),
                "aws_request_id": getattr(aws_context, "aws_request_id", None),
            })

        sentry_sdk.set_context("request_meta", {
            "path": request.url.path,
            "method": request.method,
            "query_params": {k: _safe_log_value(k, v) for k, v in request.query_params.items()},
            "upload_id": upload_id,
            "deck_id": deck_id,
            "api_gateway_request_id": (
                aws_event.get("requestContext", {}).get("requestId")
                if isinstance(aws_event, dict)
                else None
            ),
        })

        try:
            response = await call_next(request)
            sentry_sdk.set_tag("http.status_code", response.status_code)
            return response
        except Exception as exc:
            capture_backend_exception(
                exc,
                feature="api",
                action="request_failed",
                tags={
                    "path": request.url.path,
                    "method": request.method,
                    "upload_id": upload_id,
                    "deck_id": deck_id,
                },
                extra={
                    "execution_time_ms": round((time.perf_counter() - start) * 1000, 2),
                    "query_params": dict(request.query_params),
                },
            )
            raise
        finally:
            sentry_sdk.set_context("performance", {
                "execution_time_ms": round((time.perf_counter() - start) * 1000, 2),
            })
