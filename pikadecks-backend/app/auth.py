import os
import jwt
import requests

from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

JWKS_URL = os.getenv("CLERK_JWKS_URL")

_jwks = None


def get_jwks():
    global _jwks

    if not JWKS_URL:
        raise HTTPException(
            status_code=500,
            detail="CLERK_JWKS_URL is not configured",
        )

    if _jwks is None:
        response = requests.get(JWKS_URL, timeout=10)
        response.raise_for_status()
        try:
            _jwks = response.json()
        except ValueError:
            raise HTTPException(
                status_code=502,
                detail="Clerk JWKS endpoint returned a non-JSON response",
            )

    return _jwks


def verify_token(token: str):
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")

        if alg == "HS256":
            secret = os.getenv("MCP_JWT_SECRET", "pkd_mcp_jwt_secret_key_2026_98877123")
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
                leeway=120,
            )
            return payload

        jwks = get_jwks()
        key = next(
            k for k in jwks["keys"]
            if k["kid"] == header["kid"]
        )

        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)

        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
            leeway=120,
        )

        return payload

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print("verify_token failed with exception:")
        traceback.print_exc()
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )
