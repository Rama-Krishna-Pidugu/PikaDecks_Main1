from fastapi import Header, HTTPException

from app.auth import verify_token
from app.database import supabase
from app.observability import set_app_user_context


def get_current_user(
    authorization: str = Header(None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing bearer token",
        )

    token = authorization.split("Bearer ")[1]

    payload = verify_token(token)

    clerk_user_id = payload["sub"]

    # Use list result (not .single()) to safely handle new users not yet synced
    user_response = (
        supabase.table("users")
        .select("*")
        .eq("clerk_user_id", clerk_user_id)
        .execute()
    )

    if not user_response.data or len(user_response.data) == 0:
        raise HTTPException(
            status_code=404,
            detail="User not found. Please try signing out and signing in again.",
        )

    user = user_response.data[0]
    if user.get("account_status", "active") != "active":
        raise HTTPException(
            status_code=403,
            detail="This account is not active.",
        )
    set_app_user_context(user)
    return user
