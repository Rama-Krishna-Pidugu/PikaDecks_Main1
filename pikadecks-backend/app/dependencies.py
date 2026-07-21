from fastapi import Header, HTTPException, Request, Response
import hashlib
import json
from app.auth import verify_token
from app.observability import set_app_user_context


def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing bearer token",
        )

    token = authorization.split("Bearer ")[1]
    payload = verify_token(token)
    set_app_user_context(payload)
    return payload

def apply_etag(request: Request, response: Response, data: dict):
    """
    Calculates ETag for data and returns 304 if it matches If-None-Match.
    Otherwise returns the original data with the ETag header.
    """
    content = json.dumps(data, sort_keys=True).encode("utf-8")
    etag = hashlib.md5(content).hexdigest()
    
    response.headers["ETag"] = etag
    
    if request.headers.get("if-none-match") == etag:
        response.status_code = 304
        return None
        
    return data
