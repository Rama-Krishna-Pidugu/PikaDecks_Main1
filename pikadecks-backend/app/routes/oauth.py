import os
import time
import secrets
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
import jwt

from app.database import supabase
from app.auth import verify_token

logger = logging.getLogger("pikadecks.oauth")
router = APIRouter(prefix="/oauth", tags=["oauth"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


class ConsentApproveRequest(BaseModel):
    client_id: str
    redirect_uri: str
    state: str = ""
    scope: str = ""
    clerk_token: str


def get_oauth_jwt_secrets() -> tuple[str, str]:
    jwt_secret = os.getenv("OAUTH_JWT_SECRET")
    refresh_secret = os.getenv("OAUTH_REFRESH_SECRET")
    if not jwt_secret or not refresh_secret:
        raise HTTPException(
            status_code=500,
            detail="OAuth configuration error: secrets are not initialized."
        )
    return jwt_secret, refresh_secret


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_access_token(request: Request) -> dict:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning(f"verify_access_token failed: auth_header mismatch (starts with Bearer? {bool(auth_header and auth_header.startswith('Bearer '))})")
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split("Bearer ")[1]
    jwt_secret, _ = get_oauth_jwt_secrets()

    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False, "verify_iss": False}
        )
        iss = payload.get("iss")
        aud = payload.get("aud")
        logger.info(f"verify_access_token success: payload={payload}")
        logger.info({
            "event": "token_debug",
            "iss": payload.get("iss"),
            "aud": payload.get("aud"),
        })
        if iss not in ("pikadecks", "https://mcp.pikadecks.app/"):
            logger.warning(f"verify_access_token failed: invalid iss={iss}")
            raise HTTPException(status_code=401, detail="Invalid token issuer")
        if aud not in ("pikadecks-mcp", "https://mcp.pikadecks.app/"):
            logger.warning(f"verify_access_token failed: invalid aud={aud}")
            raise HTTPException(status_code=401, detail="Invalid token audience")
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("verify_access_token failed: token expired")
        raise HTTPException(status_code=401, detail="Access token has expired")
    except jwt.InvalidTokenError as e:
        logger.warning(f"verify_access_token failed: invalid token: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid  access token: {str(e)}")


@router.get("/authorize")
def oauth_authorize(
    request: Request,
    client_id: str,
    redirect_uri: str,
    response_type: str = "code",
    scope: str = "",
    state: str = "",
    code_challenge: str = "",
    code_challenge_method: str = ""
):
    logger.info({
        "event": "oauth_authorize_request",
        "headers": dict(request.headers),
    })
    logger.info(f'{{"event": "oauth_authorize_request", "client_id": "{client_id}", "redirect_uri": "{redirect_uri}", "scope": "{scope}", "state": "{state}"}}')
    # 1. Validate client_id exists and is active
    client_res = supabase.table("oauth_clients").select("*").eq("client_id", client_id).eq("active", True).execute()
    if not client_res.data:
        logger.warning(f'{{"event": "oauth_authorize_failed", "reason": "invalid_client_id", "client_id": "{client_id}"}}')
        raise HTTPException(status_code=400, detail="Invalid or inactive client_id")

    client = client_res.data[0]

    # 2. Validate redirect_uri matches exactly
    if client["redirect_uri"] != redirect_uri:
        logger.warning(f'{{"event": "oauth_authorize_failed", "reason": "redirect_uri_mismatch", "client_id": "{client_id}", "expected": "{client["redirect_uri"]}", "received": "{redirect_uri}"}}')
        raise HTTPException(status_code=400, detail="Redirect URI mismatch")

    # 3. Redirect to the web app frontend consent screen
    # e.g., FRONTEND_URL/oauth/consent?client_id=...&redirect_uri=...&scope=...&state=...
    from fastapi.responses import RedirectResponse
    import urllib.parse

    frontend_state = state
    if code_challenge:
        encoded_challenge = urllib.parse.quote(code_challenge)
        encoded_method = urllib.parse.quote(code_challenge_method or "plain")
        frontend_state = f"pkce::{encoded_challenge}::{encoded_method}::{state}"

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope,
        "state": frontend_state
    }
    url_parts = urllib.parse.urlencode(params)
    consent_url = f"{FRONTEND_URL.rstrip('/')}/oauth/consent?{url_parts}"
    return RedirectResponse(url=consent_url)


@router.post("/consent/approve")
def oauth_consent_approve(body: ConsentApproveRequest):
    logger.info(f'{{"event": "oauth_consent_approve_request", "client_id": "{body.client_id}", "redirect_uri": "{body.redirect_uri}", "scope": "{body.scope}", "state": "{body.state}"}}')
    # 1. Verify Clerk Token
    try:
        clerk_payload = verify_token(body.clerk_token)
    except Exception as e:
        logger.warning(f'{{"event": "oauth_consent_approve_failed", "reason": "clerk_token_invalid", "client_id": "{body.client_id}", "error": "{str(e)}"}}')
        raise HTTPException(status_code=401, detail=f"Invalid Clerk token: {str(e)}")

    clerk_user_id = clerk_payload.get("sub")
    if not clerk_user_id:
        logger.warning(f'{{"event": "oauth_consent_approve_failed", "reason": "clerk_token_missing_sub", "client_id": "{body.client_id}"}}')
        raise HTTPException(status_code=401, detail="Clerk token missing subject claim")

    # 2. Look up PikaDecks user
    user_res = supabase.table("users").select("user_id").eq("clerk_user_id", clerk_user_id).execute()
    if not user_res.data:
        logger.warning(f'{{"event": "oauth_consent_approve_failed", "reason": "user_not_found", "clerk_user_id": "{clerk_user_id}"}}')
        raise HTTPException(status_code=404, detail="PikaDecks user not found")

    user_id = user_res.data[0]["user_id"]

    # 3. Validate client
    client_res = supabase.table("oauth_clients").select("*").eq("client_id", body.client_id).eq("active", True).execute()
    if not client_res.data:
        logger.warning(f'{{"event": "oauth_consent_approve_failed", "reason": "invalid_client", "client_id": "{body.client_id}"}}')
        raise HTTPException(status_code=400, detail="Invalid client")

    client = client_res.data[0]
    if client["redirect_uri"] != body.redirect_uri:
        logger.warning(f'{{"event": "oauth_consent_approve_failed", "reason": "redirect_uri_mismatch", "client_id": "{body.client_id}", "expected": "{client["redirect_uri"]}", "received": "{body.redirect_uri}"}}')
        raise HTTPException(status_code=400, detail="Redirect URI mismatch")

    # 4. Save/Update user grant (consent record)
    supabase.table("oauth_grants").upsert({
        "user_id": user_id,
        "client_id": body.client_id,
        "scope": body.scope
    }, on_conflict="user_id,client_id").execute()

    # Extract PKCE from state if present
    original_state = body.state
    code_challenge = ""
    code_challenge_method = ""
    if body.state and body.state.startswith("pkce::"):
        parts = body.state.split("::", 3)
        if len(parts) >= 4:
            import urllib.parse
            code_challenge = urllib.parse.unquote(parts[1])
            code_challenge_method = urllib.parse.unquote(parts[2])
            original_state = parts[3]

    # 5. Generate short-lived code
    raw_code = secrets.token_urlsafe(32)
    if code_challenge:
        import urllib.parse
        encoded_challenge = urllib.parse.quote(code_challenge)
        encoded_method = urllib.parse.quote(code_challenge_method)
        code = f"pkce.{raw_code}.{encoded_challenge}.{encoded_method}"
    else:
        code = f"raw.{raw_code}"

    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()

    supabase.table("oauth_codes").insert({
        "code": code,
        "user_id": user_id,
        "client_id": body.client_id,
        "redirect_uri": body.redirect_uri,
        "scope": body.scope,
        "expires_at": expires_at
    }).execute()

    logger.info(f'{{"event": "oauth_code_generated", "client_id": "{body.client_id}", "user_id": "{user_id}", "code": "{code}"}}')

    import urllib.parse
    redirect_params = {"code": code}
    if original_state:
        redirect_params["state"] = original_state

    redirect_url = f"{body.redirect_uri}?{urllib.parse.urlencode(redirect_params)}"
    return {"success": True, "redirect_url": redirect_url}


@router.post("/token")
async def oauth_token(request: Request):
    logger.info({
        "event": "oauth_token_request",
        "headers": dict(request.headers),
    })
    # Parse Basic Auth Header if present (OIDC/Claude connector standard)
    auth_header = request.headers.get("Authorization")
    basic_client_id = None
    basic_client_secret = None
    if auth_header and auth_header.lower().startswith("basic "):
        try:
            import base64
            encoded = auth_header.split(" ", 1)[1].strip()
            decoded = base64.b64decode(encoded).decode("utf-8")
            if ":" in decoded:
                basic_client_id, basic_client_secret = decoded.split(":", 1)
        except Exception as e:
            logger.warning(f"Failed to parse Basic Auth header: {e}")

    # Parse grant parameters from body (JSON or Form-URL-Encoded) or query params
    body_str = ""
    try:
        body_bytes = await request.body()
        body_str = body_bytes.decode("utf-8")
    except Exception:
        pass

    content_type = request.headers.get("content-type", "")
    form_data = {}

    if "application/json" in content_type:
        try:
            import json
            form_data = json.loads(body_str) if body_str else {}
        except Exception:
            pass
    else:
        try:
            import urllib.parse
            parsed = urllib.parse.parse_qs(body_str) if body_str else {}
            form_data = {k: v[0] for k, v in parsed.items() if v}
        except Exception:
            pass

    def clean_param(val):
        if val is None: return None
        if isinstance(val, str):
            return val.strip("'\" \n\r\t")
        return val

    grant_type = clean_param(form_data.get("grant_type") or request.query_params.get("grant_type") or "authorization_code")
    code = clean_param(form_data.get("code") or request.query_params.get("code"))
    redirect_uri = clean_param(form_data.get("redirect_uri") or request.query_params.get("redirect_uri"))
    client_id = clean_param(form_data.get("client_id") or request.query_params.get("client_id") or basic_client_id)
    refresh_token = clean_param(form_data.get("refresh_token") or request.query_params.get("refresh_token"))
    code_verifier = clean_param(form_data.get("code_verifier") or request.query_params.get("code_verifier"))

    rt_record = None

    logger.info(
        f"oauth_token_request client_id={client_id} "
        f"grant_type={grant_type} "
        f"has_code={bool(code)} "
        f"has_code_verifier={bool(code_verifier)}"
    )
    logger.info({
    "event": "oauth_token_request",
    "client_id": client_id,
    "grant_type": grant_type,
    "has_code": bool(code),
    "has_code_verifier": bool(code_verifier),
    "has_basic_auth": bool(auth_header)
})

    jwt_secret, refresh_secret = get_oauth_jwt_secrets()

    if grant_type == "authorization_code":
        if not code or not redirect_uri or not client_id:
            logger.warning(f'{{"event": "oauth_token_failed", "reason": "missing_parameters", "client_id": "{client_id}", "code": "{code}", "redirect_uri": "{redirect_uri}"}}')
            raise HTTPException(status_code=400, detail="Missing required parameters for authorization_code flow")

        # 1. Fetch code record
        code_res = supabase.table("oauth_codes").select("*").eq("code", code).execute()
        if not code_res.data:
            logger.warning(f'{{"event": "oauth_token_failed", "reason": "invalid_code", "client_id": "{client_id}", "code": "{code}"}}')
            raise HTTPException(status_code=400, detail="Invalid or expired authorization code")

        code_record = code_res.data[0]

        # Single-use: delete immediately
        supabase.table("oauth_codes").delete().eq("code", code).execute()

        # Check expiration
        expires_at = datetime.fromisoformat(code_record["expires_at"].replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Authorization code has expired")

        if code_record["client_id"] != client_id or code_record["redirect_uri"] != redirect_uri:
            raise HTTPException(status_code=400, detail="Authorization code validation failed (client_id/redirect_uri mismatch)")

        # Validate PKCE code_verifier
        challenge = ""
        challenge_method = ""
        if code.startswith("pkce."):
            parts = code.split(".")
            if len(parts) >= 4:
                import urllib.parse
                challenge = urllib.parse.unquote(parts[2])
                challenge_method = urllib.parse.unquote(parts[3])

        if challenge:
            if not code_verifier:
                logger.warning("PKCE verification failed: code_verifier is missing")
                raise HTTPException(status_code=400, detail="Missing code_verifier for PKCE validation")

            if challenge_method == "S256":
                import base64
                import hashlib
                sha256_hash = hashlib.sha256(code_verifier.encode("ascii")).digest()
                expected_challenge = base64.urlsafe_b64encode(sha256_hash).decode("ascii").rstrip("=")
                if expected_challenge != challenge.rstrip("="):
                    logger.warning(f"PKCE verification failed: challenge mismatch. Expected {expected_challenge}, got {challenge}")
                    raise HTTPException(status_code=400, detail="Invalid code_verifier (PKCE validation failed)")
            elif challenge_method == "plain":
                if code_verifier != challenge:
                    logger.warning(f"PKCE verification failed (plain): mismatch. Expected {challenge}, got {code_verifier}")
                    raise HTTPException(status_code=400, detail="Invalid code_verifier (PKCE validation failed)")
            else:
                logger.warning(f"Unsupported challenge method: {challenge_method}")
                raise HTTPException(status_code=400, detail=f"Unsupported code_challenge_method: {challenge_method}")

        user_id = code_record["user_id"]
        scope = code_record["scope"]

    elif grant_type == "refresh_token":
        logger.info({
            "event": "refresh_token_received",
            "client_id": client_id,
            "has_refresh_token": bool(refresh_token)
        })
        if not refresh_token or not client_id:
            raise HTTPException(status_code=400, detail="Missing refresh_token or client_id")

        token_hash = hash_token(refresh_token)
        logger.info({
            "event": "refresh_token_lookup",
            "token_hash": token_hash[:20]
        })

        # Look up refresh token
        rt_res = (
            supabase.table("refresh_tokens")
            .select("*")
            .eq("token_hash", token_hash)
            .eq("client_id", client_id)
            .eq("revoked", False)
            .execute()
        )
        logger.info({
            "event": "refresh_token_query_result",
            "count": len(rt_res.data or [])
        })

        if not rt_res.data:
            logger.error({
                "event": "refresh_token_not_found",
                "client_id": client_id,
                "token_hash": token_hash[:20]
            })
            raise HTTPException(status_code=400, detail="Invalid or revoked refresh token")

        rt_record = rt_res.data[0]
        logger.info({
            "event": "refresh_token_found",
            "expires_at": rt_record["expires_at"],
            "revoked": rt_record["revoked"]
        })

        # Check expiration
        expires_at = datetime.fromisoformat(rt_record["expires_at"].replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Refresh token has expired")

        user_id = rt_record["user_id"]
        scope = "read:decks write:decks write:cards"  # default scopes

    else:
        logger.warning(f'{{"event": "oauth_token_failed", "reason": "unsupported_grant_type", "grant_type": "{grant_type}"}}')
        raise HTTPException(status_code=400, detail="Unsupported grant_type")

    # Generate Access Token (JWT)
    access_token_payload = {
        "sub": str(user_id),
        "client_id": client_id,
        "scope": scope,
        "iss": "https://mcp.pikadecks.app/",
        "aud": "https://mcp.pikadecks.app/",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600
    }
    access_token = jwt.encode(access_token_payload, jwt_secret, algorithm="HS256")

    new_raw_refresh_token = secrets.token_urlsafe(64)
    new_token_hash = hash_token(new_raw_refresh_token)
    rt_expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    insert_result = supabase.table("refresh_tokens").insert({
        "user_id": user_id,
        "client_id": client_id,
        "token_hash": new_token_hash,
        "expires_at": rt_expires_at
    }).execute()

    if not insert_result.data:
        logger.error({
            "event": "refresh_token_insert_failed",
            "user_id": user_id,
            "client_id": client_id
        })
        raise HTTPException(status_code=500, detail="Failed to issue refresh token")

    logger.info({
        "event": "refresh_token_insert_success",
        "user_id": user_id,
        "client_id": client_id,
        "hash": new_token_hash[:20],
        "rows": len(insert_result.data)
    })

    # Only after successful insert do we update the old token (if applicable)
    if grant_type == "refresh_token" and rt_record:
        try:
            grace_expiry = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()
            supabase.table("refresh_tokens").update({
                "expires_at": grace_expiry
            }).eq("token_id", rt_record["token_id"]).execute()
        except Exception as e:
            logger.error({
                "event": "refresh_token_grace_period_failed",
                "token_id": rt_record["token_id"],
                "error": str(e)
            })

    logger.info(
        f"oauth_token_response iss={access_token_payload.get('iss')} "
        f"aud={access_token_payload.get('aud')}"
    )
    logger.info({
        "event": "oauth_token_success",
        "client_id": client_id,
        "user_id": user_id,
        "scope": scope
    })
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": 3600,
        "refresh_token": new_raw_refresh_token,
        "scope": scope
    }


@router.get("/userinfo")
def oauth_userinfo(request: Request):
    logger.info("oauth_userinfo_request")
    try:
        payload = verify_access_token(request)
        user_id = payload.get("sub")
    except Exception as e:
        logger.warning(f'{{"event": "oauth_userinfo_failed", "reason": "access_token_invalid", "error": "{str(e)}"}}')
        raise

    logger.info(f'{{"event": "oauth_userinfo_request", "user_id": "{user_id}"}}')

    user_res = supabase.table("users").select("user_id, email, name").eq("user_id", user_id).execute()
    if not user_res.data:
        logger.warning(f'{{"event": "oauth_userinfo_failed", "reason": "user_not_found", "user_id": "{user_id}"}}')
        raise HTTPException(status_code=404, detail="User not found")

    user = user_res.data[0]
    
    logger.info(
        f"oauth_userinfo_response sub={user['user_id']}"
    )
    return {
        "sub": user["user_id"],
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"]
    }


@router.post("/revoke")
def oauth_revoke(token: str, client_id: str):
    # Compute SHA-256 hash
    token_hash = hash_token(token)

    # Invalidate refresh tokens matching hash
    supabase.table("refresh_tokens").update({"revoked": True}).eq("token_hash", token_hash).eq("client_id", client_id).execute()
    return {"success": True}


@router.get("/grants")
def oauth_list_grants(request: Request):
    # Requires Clerk token authentication from the frontend dashboard
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    clerk_token = auth_header.split("Bearer ")[1]
    try:
        clerk_payload = verify_token(clerk_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication: {str(e)}")

    clerk_user_id = clerk_payload.get("sub")
    user_res = supabase.table("users").select("user_id").eq("clerk_user_id", clerk_user_id).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = user_res.data[0]["user_id"]

    # Retrieve all user grants combined with client details
    grants_res = (
        supabase.table("oauth_grants")
        .select("id, client_id, scope, created_at, oauth_clients(client_name)")
        .eq("user_id", user_id)
        .execute()
    )

    return {"success": True, "grants": grants_res.data}


@router.delete("/grants/{grant_id}")
def oauth_delete_grant(grant_id: str, request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    clerk_token = auth_header.split("Bearer ")[1]
    try:
        clerk_payload = verify_token(clerk_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication: {str(e)}")

    clerk_user_id = clerk_payload.get("sub")
    user_res = supabase.table("users").select("user_id").eq("clerk_user_id", clerk_user_id).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = user_res.data[0]["user_id"]

    # 1. Fetch grant to verify ownership
    grant_res = supabase.table("oauth_grants").select("*").eq("id", grant_id).eq("user_id", user_id).execute()
    if not grant_res.data:
        raise HTTPException(status_code=404, detail="Grant not found")

    grant = grant_res.data[0]

    # 2. Revoke associated refresh tokens
    supabase.table("refresh_tokens").update({"revoked": True}).eq("user_id", user_id).eq("client_id", grant["client_id"]).execute()

    # 3. Delete grant
    supabase.table("oauth_grants").delete().eq("id", grant_id).execute()

    return {"success": True}
