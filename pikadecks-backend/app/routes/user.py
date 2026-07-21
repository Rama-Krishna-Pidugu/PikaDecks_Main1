import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.database import supabase
from app.dependencies import get_current_user
from app.services.file_cleanup import RETENTION_DAYS, delete_after, schedule_upload_file_cleanup

router = APIRouter()


@router.post("/sync-user")
def sync_user(current_user: dict = Depends(get_current_user)):
    payload = current_user
    clerk_user_id = payload["sub"]

    email = payload.get("email") or f"{clerk_user_id}@pikadecks.local"

    name = payload.get("name")

    profile_pic = payload.get("picture")

    existing_user = (
        supabase.table("users")
        .select("*")
        .eq("clerk_user_id", clerk_user_id)
        .execute()
    )

    if existing_user.data:
        user = existing_user.data[0]
        if user.get("is_deleted") or user.get("account_status") == "pending_deletion":
            # Cancel deletion and restore account
            updated_res = (
                supabase.table("users")
                .update({
                    "is_deleted": False,
                    "deleted_at": None,
                    "scheduled_deletion_at": None,
                    "account_status": "active",
                    "deletion_requested_at": None,
                    "delete_after": None,
                    "deletion_reason": None,
                })
                .eq("user_id", user["user_id"])
                .execute()
            )
            restored_user = updated_res.data[0] if updated_res.data else user
            return {
                "success": True,
                "user": restored_user,
                "new_user": False,
                "restored": True,
            }

        return {
            "success": True,
            "user": user,
            "new_user": False,
        }

    existing_email_user = (
        supabase.table("users")
        .select("*")
        .eq("email", email)
        .execute()
    )

    if existing_email_user.data:
        user = existing_email_user.data[0]
        update_payload = {"clerk_user_id": clerk_user_id}

        if name:
            update_payload["name"] = name

        if profile_pic:
            update_payload["profile_pic"] = profile_pic

        restored = False
        if user.get("is_deleted") or user.get("account_status") == "pending_deletion":
            update_payload.update({
                "is_deleted": False,
                "deleted_at": None,
                "scheduled_deletion_at": None,
                "account_status": "active",
                "deletion_requested_at": None,
                "delete_after": None,
                "deletion_reason": None,
            })
            restored = True

        updated_user = (
            supabase.table("users")
            .update(update_payload)
            .eq("user_id", user["user_id"])
            .execute()
        )

        return {
            "success": True,
            "user": updated_user.data[0] if updated_user.data else user,
            "new_user": False,
            "linked_existing_email": True,
            "restored": restored,
        }

    new_user = (
        supabase.table("users")
        .insert({
            "clerk_user_id": clerk_user_id,
            "email": email,
            "name": name,
            "profile_pic": profile_pic,
        })
        .execute()
    )

    if not new_user.data:
        refetched_user = (
            supabase.table("users")
            .select("*")
            .eq("clerk_user_id", clerk_user_id)
            .execute()
        )

        if refetched_user.data:
            return {
                "success": True,
                "user": refetched_user.data[0],
                "new_user": False,
            }

        raise HTTPException(
            status_code=502,
            detail="User was created but Supabase did not return the user row.",
        )

    return {
        "success": True,
        "user": new_user.data[0],
        "new_user": True,
    }


@router.delete("/delete-user")
def delete_user(current_user: dict = Depends(get_current_user)):
    clerk_user_id = current_user["sub"]

    user_res = (
        supabase.table("users")
        .select("user_id,account_status")
        .eq("clerk_user_id", clerk_user_id)
        .limit(1)
        .execute()
    )

    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")

    user = user_res.data[0]
    user_id = user["user_id"]
    due_at = delete_after(days=7)
    now = datetime.datetime.utcnow().isoformat()

    supabase.table("users").update({
        "account_status": "pending_deletion",
        "deletion_requested_at": now,
        "delete_after": due_at.isoformat(),
        "deletion_reason": "user_requested",
        "is_deleted": True,
        "deleted_at": now,
        "scheduled_deletion_at": due_at.isoformat(),
    }).eq("user_id", user_id).execute()

    uploads = (
        supabase.table("uploads")
        .select("upload_id,file_url")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    for upload in uploads:
        schedule_upload_file_cleanup(
            upload_id=upload["upload_id"],
            user_id=user_id,
            file_url=upload.get("file_url"),
            reason="account_deletion",
            retention_days=7,
        )

    return {
        "success": True,
        "message": f"Account deletion scheduled. Your data will be permanently deleted after 7 days.",
        "delete_after": due_at.isoformat(),
    }
