from fastapi import APIRouter, Depends, HTTPException, Request, Response
import os
from app.database import supabase
from app.models.decks import DeckCreate, DeckUpdate
from app.services.get_current_user import get_current_user
from app.dependencies import apply_etag


router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("")
def list_decks(
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_user)
):
    res = (
        supabase.table("decks")
        .select("*")
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True)
        .execute()
    )

    data = {
        "success": True,
        "decks": res.data,
    }
    
    return apply_etag(request, response, data)


@router.post("")
def create_deck(
    body: DeckCreate,
    current_user: dict = Depends(get_current_user),
):
    payload = {
        "user_id": current_user["user_id"],
        "title": body.title,
        "description": body.description,
    }
    if body.notes_content is not None:
        payload["notes_content"] = body.notes_content
    if body.notes_image_urls is not None:
        payload["notes_image_urls"] = body.notes_image_urls

    res = (
        supabase.table("decks")
        .insert(payload)
        .execute()
    )

    return {
        "success": True,
        "deck": res.data[0],
    }


@router.get("/{deck_id}")
def get_deck(
    deck_id: str,
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_user),
):
    res = (
        supabase.table("decks")
        .select("*")
        .eq("deck_id", deck_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )

    if not res.data:
        raise HTTPException(status_code=404, detail="Deck not found")

    data = {
        "success": True,
        "deck": res.data[0],
    }
    
    return apply_etag(request, response, data)


@router.patch("/{deck_id}")
def update_deck(
    deck_id: str,
    body: DeckUpdate,
    current_user: dict = Depends(get_current_user),
):
    updates = body.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    response = (
        supabase.table("decks")
        .update(updates)
        .eq("deck_id", deck_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Deck not found")

    return {
        "success": True,
        "deck": response.data[0],
    }


@router.put("/{deck_id}")
def replace_deck(
    deck_id: str,
    body: DeckUpdate,
    current_user: dict = Depends(get_current_user),
):
    return update_deck(deck_id, body, current_user)


@router.delete("/{deck_id}")
def delete_deck(
    deck_id: str,
    current_user: dict = Depends(get_current_user),
):
    response = (
        supabase.table("decks")
        .delete()
        .eq("deck_id", deck_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Deck not found")

    return {
        "success": True,
        "deck": response.data[0],
    }


from pydantic import BaseModel
import uuid
from app.services.s3_utils import generate_presigned_upload_url, presign_s3_url

class ImageUploadRequest(BaseModel):
    filename: str
    content_type: str
    target: str  # e.g., "question", "notes"

@router.post("/{deck_id}/images/upload-url")
def request_image_upload_url(
    deck_id: str,
    body: ImageUploadRequest,
    current_user: dict = Depends(get_current_user),
):
    # Verify deck ownership
    res = (
        supabase.table("decks")
        .select("deck_id")
        .eq("deck_id", deck_id)
        .eq("user_id", current_user["user_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Deck not found")

    user_id = current_user["user_id"]
    env = os.getenv("ENVIRONMENT", "dev")
    
    # Extract extension securely
    ext = ".webp"
    if body.filename and "." in body.filename:
        parsed_ext = body.filename.rsplit(".", 1)[-1].lower()
        if parsed_ext in ["png", "jpg", "jpeg", "webp", "gif"]:
            ext = f".{parsed_ext}"

    # Generate a secure, randomized S3 object key
    unique_id = str(uuid.uuid4())
    # Example: prod/users/{userId}/decks/{deckId}/cards/{uuid}.webp
    object_key = f"{env}/users/{user_id}/decks/{deck_id}/images/{unique_id}{ext}"

    try:
        # Generate presigned PUT URL
        upload_url = generate_presigned_upload_url(object_key, body.content_type, expires_in=900)
        # Generate presigned GET URL for immediate preview
        file_url = presign_s3_url(object_key, expires_in=900)
        return {
            "success": True,
            "upload_url": upload_url,
            "image_key": object_key,
            "file_url": file_url
        }
    except Exception as e:
        import traceback
        error_msg = f"Failed to generate upload URL: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=str(e))
