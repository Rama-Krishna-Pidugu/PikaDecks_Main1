import os
import logging
import sys

# Configure standard logging to stdout at INFO level
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,
)

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
import sentry_sdk
from fastapi.middleware.cors import CORSMiddleware

from app.routes.cards import router as cards_router
from app.routes.billing import router as billing_router
from app.routes.decks import router as decks_router
from app.routes.protected import router as protected_router
from app.routes.notifications import router as notifications_router
from app.routes.reviews import router as reviews_router
from app.routes.stats import router as stats_router
from app.routes.uploads import router as uploads_router
from app.routes.user import router as user_router
from app.routes.youtube import router as youtube_router
from app.routes.mcp import router as mcp_router
from app.routes.oauth import router as oauth_router
from app.observability import SentryRequestContextMiddleware, init_sentry


init_sentry()


app = FastAPI(title="PikaDecks Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SentryRequestContextMiddleware)

app.include_router(protected_router)
app.include_router(user_router)
app.include_router(billing_router)
app.include_router(decks_router)
app.include_router(cards_router)
app.include_router(uploads_router)
app.include_router(youtube_router)
app.include_router(stats_router)
app.include_router(reviews_router)
app.include_router(notifications_router)
app.include_router(mcp_router)
app.include_router(oauth_router)


@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    sentry_sdk.capture_exception(exc)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    sentry_sdk.capture_exception(exc)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "PikaDecks Backend Running"}


@app.get("/.well-known/oauth-authorization-server")
@app.get("/.well-known/openid-configuration")
def oauth_metadata(request: Request) -> dict:
    base_url = str(request.base_url).rstrip("/")
    root_path = request.scope.get("root_path", "")
    if root_path and not base_url.endswith(root_path):
        base_url = f"{base_url}{root_path}"

    return {
        "issuer": base_url,
        "authorization_endpoint": f"{base_url}/oauth/authorize",
        "token_endpoint": f"{base_url}/oauth/token",
        "revocation_endpoint": f"{base_url}/oauth/revoke",
        "userinfo_endpoint": f"{base_url}/oauth/userinfo",
        "scopes_supported": ["read:decks", "write:decks", "write:cards"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic", "none"],
        "code_challenge_methods_supported": ["S256"]
    }


@app.get("/sentry-test")
def sentry_test() -> dict[str, str]:
    if os.getenv("SENTRY_ENVIRONMENT") != "test":
        raise HTTPException(status_code=404, detail="Not found")

    raise RuntimeError("Backend Sentry test error")


@app.get("/sentry-debug")
async def sentry_debug():
    if os.getenv("SENTRY_ENVIRONMENT") != "test":
        raise HTTPException(status_code=404, detail="Not found")

    division_by_zero = 1 / 0
    return {"division_by_zero": division_by_zero}
