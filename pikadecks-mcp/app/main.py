import json
import logging
import sys
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from mcp.server.fastmcp import FastMCP
import sentry_sdk

from app.config import get_settings
from app.tools.health import register_health_tools
from app.tools.decks import register_decks_tools
from mcp.server.transport_security import TransportSecuritySettings

import os
import httpx
from fastapi.responses import RedirectResponse, JSONResponse, Response

settings = get_settings()
BASE_URL = os.getenv("MCP_BASE_URL", "https://mcp.pikadecks.app/").rstrip("/") + "/"


if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=1.0,
    )

logging.basicConfig(
    level=settings.log_level,
    format="%(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,
)
logger = logging.getLogger("pikadecks-mcp")

from mcp.server.fastmcp.server import AuthSettings
from mcp.server.auth.provider import AccessToken
import jwt

auth_settings = AuthSettings(
    issuer_url="https://mcp.pikadecks.app/",
    resource_server_url="https://mcp.pikadecks.app/",
    required_scopes=[] # Relaxed to allow Claude's token even if missing specific scopes
)

class PikaDecksTokenVerifier:
    async def verify_token(self, token: str) -> AccessToken | None:
        logger.info({
            "event": "mcp_verify_token_called",
            "token_present": bool(token),
            "token_prefix": token[:30] if token else None
        })

        if not token:
            logger.warning({"event": "mcp_token_rejected", "reason": "token_missing"})
            return None

        # Standardize token: strip Bearer prefix if present
        clean_token = token
        if token.startswith("Bearer "):
            clean_token = token[7:]
            logger.debug("Stripped Bearer prefix from token")

        jwt_secret = os.getenv("MCP_JWT_SECRET") or os.getenv("OAUTH_JWT_SECRET") or "pkd_mcp_jwt_secret_key_2026_98877123"

        try:
            payload = jwt.decode(
                clean_token,
                jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False, "verify_iss": False}
            )

            iss = payload.get("iss")
            aud = payload.get("aud")

            logger.info({
                "event": "jwt_decode_success",
                "iss": iss,
                "aud": aud,
                "sub": payload.get("sub")
            })
            logger.info({
                "event": "mcp_token_received",
                "iss": payload.get("iss"),
                "aud": payload.get("aud"),
                "scope": payload.get("scope") or payload.get("scopes"),
                "sub": payload.get("sub"),
                "client_id": payload.get("client_id")
            })
            iss = payload.get("iss")
            aud = payload.get("aud")
            
            valid_issuers = ("pikadecks", "https://mcp.pikadecks.app/", "https://api.pikadecks.app/")
            if iss not in valid_issuers:
                logger.warning({
                    "event": "mcp_token_rejected",
                    "reason": "invalid_issuer",
                    "iss": iss
                })
                return None
            
            valid_audiences = ("pikadecks-mcp", "https://mcp.pikadecks.app/")
            is_valid_aud = False
            if isinstance(aud, list):
                is_valid_aud = any(a in valid_audiences for a in aud)
            else:
                is_valid_aud = aud in valid_audiences
                
            if aud is not None and not is_valid_aud:
                logger.warning({
                    "event": "mcp_token_rejected",
                    "reason": "invalid_audience",
                    "aud": aud
                })
                return None
                
            scope_claim = payload.get("scope") or payload.get("scopes", "")
            if isinstance(scope_claim, list):
                scopes = [str(s).strip() for s in scope_claim if str(s).strip()]
            else:
                scopes = [s.strip() for s in str(scope_claim).split(" ") if s.strip()]
            
            logger.info({
                "event": "mcp_token_accepted",
                "scope": scopes,
                "sub": payload.get("sub")
            })

            return AccessToken(
                token=clean_token,
                client_id=payload.get("client_id", "pikadecks-mcp"),
                scopes=scopes,
                expires_at=payload.get("exp"),
                resource="https://mcp.pikadecks.app/"
            )
        except jwt.ExpiredSignatureError:
            logger.warning("Token verification failed: Token has expired")
            return None
        except jwt.InvalidSignatureError:
            logger.warning("Token verification failed: Invalid signature. Check if RS256 is used instead of HS256, or if the secret is wrong.")
            return None
        except Exception as e:
            logger.warning(f"Token verification failed: {type(e).__name__} - {e}")
            return None

mcp = FastMCP(
    settings.service_name,
    json_response=True,
    streamable_http_path="/mcp",
    stateless_http=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    ),
    auth=auth_settings,
    token_verifier=PikaDecksTokenVerifier()
)
register_health_tools(mcp)
register_decks_tools(mcp)
mcp_app = mcp.streamable_http_app()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if hasattr(mcp.session_manager, "_has_started"):
        mcp.session_manager._has_started = False
    async with mcp.session_manager.run():
        yield


app = FastAPI(title=settings.service_name, version=settings.version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "Mcp-Session-Id", "MCP-Protocol-Version"],
)


@app.get("/")
async def mcp_handshake(request: Request):
    accept = request.headers.get("accept", "")
    if "text/event-stream" in accept:
        # Allow the SSE handshake to proceed without auth
        return await mcp_app(request.scope, request._receive, request._send)

    return {
        "service": settings.service_name,
        "status": "running",
        "version": settings.version,
        "mcp_endpoint": "/",
    }


@app.middleware("http")
async def request_id_and_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid4())
    start = time.perf_counter()

    # Capture request body safely
    body_str = ""
    if request.method in ("POST", "PUT", "PATCH"):
        try:
            body = await request.body()
            body_str = body.decode("utf-8", errors="replace")
            # Reset request receive stream so downstream route handlers can read it
            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}
            request._receive = receive
        except Exception as body_ex:
            body_str = f"<Error reading body: {str(body_ex)}>"

    # Filter/capture headers of interest
    logged_headers = {}
    logger.info({
        "event": "mcp_request",
        "path": request.url.path,
        "auth_header": bool(request.headers.get("authorization"))
    })
    for k, v in request.headers.items():
        k_lower = k.lower()
        if k_lower == "authorization":
            logged_headers[k] = f"Bearer_present={v.startswith('Bearer ')}"
        elif any(prefix in k_lower for prefix in ("mcp", "x-request-id", "user-agent", "content", "accept")):
            logged_headers[k] = v

    logger.info(
        json.dumps(
            {
                "event": "request_received",
                "request_id": request_id,
                "path": request.url.path,
                "method": request.method,
                "authorization": request.headers.get("authorization"),
                "query_params": dict(request.query_params),
                "headers": logged_headers,
                "body": body_str,
            }
        )
    )

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.exception(
            json.dumps(
                {
                    "event": "request_failed",
                    "request_id": request_id,
                    "path": request.url.path,
                    "method": request.method,
                    "duration_ms": duration_ms,
                }
            )
        )
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "request_id": request_id},
            headers={"X-Request-ID": request_id},
        )

    if response.status_code == 401:
        response.headers["WWW-Authenticate"] = f'Bearer realm="{settings.service_name}", resource_metadata="issuer={auth_settings.issuer_url},scopes={",".join(auth_settings.required_scopes)}"'

    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        json.dumps(
            {
                "event": "request_completed",
                "request_id": request_id,
                "path": request.url.path,
                "method": request.method,
                "authorization": request.headers.get("authorization"),
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            }
        )
    )
    return response



@app.get("/.well-known/oauth-authorization-server")
@app.get("/.well-known/openid-configuration")
def oauth_metadata() -> dict:
    base_url_no_slash = BASE_URL.rstrip("/")
    return {
        "issuer": BASE_URL,
        "authorization_endpoint": f"{base_url_no_slash}/oauth/authorize",
        "token_endpoint": f"{base_url_no_slash}/oauth/token",
        "revocation_endpoint": f"{base_url_no_slash}/oauth/revoke",
        "userinfo_endpoint": f"{base_url_no_slash}/oauth/userinfo",
        "resource": BASE_URL,
        "scopes_supported": ["read:decks", "write:decks", "write:cards"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic", "none"],
        "code_challenge_methods_supported": ["S256"]
    }


@app.get("/.well-known/oauth-protected-resource")
def oauth_protected_resource() -> dict:
    return {
        "resource": BASE_URL,
        "authorization_servers": [BASE_URL]
    }


@app.get("/oauth/authorize")
async def local_oauth_authorize(request: Request):
    # Standard browser-level redirect to preserve cookies and session state
    backend_url = f"{settings.pikadecks_api_url.rstrip('/')}/oauth/authorize"
    query_string = request.url.query
    redirect_url = f"{backend_url}?{query_string}" if query_string else backend_url
    return RedirectResponse(url=redirect_url)


@app.post("/oauth/token")
async def local_oauth_token(request: Request):
    backend_url = f"{settings.pikadecks_api_url.rstrip('/')}/oauth/token"

    headers = dict(request.headers)
    headers.pop("host", None)

    body = await request.body()
    try:
        body_str = body.decode('utf-8')
    except Exception:
        body_str = "<binary_data>"

    logger.info({
        "event": "oauth_token_request_started",
        "backend_url": backend_url,
        "incoming_headers": headers,
        "incoming_body": body_str
    })

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            backend_url,
            content=body,
            headers=headers,
            params=dict(request.query_params)
        )

        logger.info({
            "event": "oauth_token_response_received",
            "status_code": resp.status_code,
            "raw_response_text": resp.text
        })

        try:
            token_data = resp.json()
            if "access_token" in token_data:
                try:
                    claims = jwt.decode(
                        token_data["access_token"],
                        options={"verify_signature": False}
                    )
                    logger.info({"event": "access_token_claims", "claims": claims})
                except Exception as e:
                    logger.warning({"event": "token_decode_failed", "error": str(e)})
        except Exception as e:
            logger.warning({
                "event": "oauth_response_not_json",
                "error": str(e)
            })

        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers={
                "Content-Type": resp.headers.get("content-type", "application/json"),
                "Cache-Control": "no-store",
                "Pragma": "no-cache"
            }
        )



@app.get("/oauth/userinfo")
async def local_oauth_userinfo(request: Request):
    backend_url = f"{settings.pikadecks_api_url.rstrip('/')}/oauth/userinfo"
    headers = dict(request.headers)
    headers.pop("host", None)
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(
            backend_url,
            headers=headers,
            params=dict(request.query_params)
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers={"Content-Type": resp.headers.get("content-type", "application/json")}
        )


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "service": settings.service_name,
        "healthy": True,
        "environment": settings.environment,
    }


@app.get("/version")
def version() -> dict[str, str]:
    return {
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
    }


@app.get("/mcp-status")
def mcp_debug() -> dict[str, str]:
    return {
        "service": settings.service_name,
        "status": "running",
    }


@app.get("/debug/mcp")
async def mcp_debug_info():
    try:
        tools = await mcp.list_tools()
        tools_list = [t.model_dump() for t in tools]
    except Exception as e:
        tools_list = f"Error listing tools: {str(e)}"

    return {
        "mcp_settings": {
            "debug": mcp.settings.debug,
            "log_level": mcp.settings.log_level,
            "host": mcp.settings.host,
            "port": mcp.settings.port,
            "mount_path": mcp.settings.mount_path,
            "sse_path": mcp.settings.sse_path,
            "message_path": mcp.settings.message_path,
            "streamable_http_path": mcp.settings.streamable_http_path,
            "json_response": mcp.settings.json_response,
            "stateless_http": mcp.settings.stateless_http,
        },
        "tools": tools_list,
    }


@app.get("/debug/routes")
def routes():
    return {
        "routes": [str(r.path) for r in app.routes]
    }

@app.get("/debug/mcp-routes")
def debug_mcp_routes():
    routes = []

    try:
        if hasattr(mcp_app, "routes"):
            for route in mcp_app.routes:
                routes.append({
                    "path": str(getattr(route, "path", None)),
                    "name": str(getattr(route, "name", None)),
                    "methods": list(getattr(route, "methods", []))
                })
    except Exception as e:
        return {"error": str(e)}

    return {
        "route_count": len(routes),
        "routes": routes
    }

@app.options("/{path:path}")
def options_handler() -> Response:
    return Response(status_code=204)


@app.get("/debug/host")
async def debug_host(request: Request):
    return {
        "host": request.headers.get("host"),
        "x_forwarded_host": request.headers.get("x-forwarded-host"),
        "x_forwarded_proto": request.headers.get("x-forwarded-proto"),
        "url": str(request.url),
        "path": request.url.path,
    }
@app.get("/debug/mcp-app")
def debug_mcp_app():
    routes = []

    if hasattr(mcp_app, "routes"):
        for route in mcp_app.routes:
            routes.append({
                "type": type(route).__name__,
                "path": str(getattr(route, "path", None)),
                "name": str(getattr(route, "name", None)),
                "methods": str(getattr(route, "methods", None)),
            })

    return {
        "routes": routes
    }

    return {
        "type": str(type(mcp_app)),
        "route_count": len(routes),
        "routes": routes
    }

app.mount("/", mcp_app)
