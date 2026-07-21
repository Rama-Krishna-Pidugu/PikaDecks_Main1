from fastapi import APIRouter, Depends, HTTPException

from app.database import supabase
from app.models.cards import CardCreate, CardUpdate
from app.services.get_current_user import get_current_user
from app.services.srs import create_initial_review_state
from app.services.s3_utils import presign_s3_url


router = APIRouter(prefix="/decks/{deck_id}/cards", tags=["cards"])


def ensure_owned_deck(deck_id: str, user_id: str):
    response = (
        supabase.table("decks")
        .select("deck_id")
        .eq("deck_id", deck_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Deck not found")


@router.post("")
def create_card(
    deck_id: str,
    body: CardCreate,
    current_user: dict = Depends(get_current_user),
):
    ensure_owned_deck(deck_id, current_user["user_id"])

    response = (
        supabase.table("cards")
        .insert({
            "deck_id": deck_id,
            "question": body.question,
            "answer": body.answer,
            "explanation": body.explanation,
            "difficulty": body.difficulty,
            "card_type": body.card_type,
            "image_key": body.image_key or body.image_url,
            "notes_image_key": body.notes_image_key or body.notes_image_url,
            "card_order": body.card_order,
        })
        .execute()
    )

    card = response.data[0]
    create_initial_review_state(current_user["user_id"], deck_id, card["card_id"])

    card["image_url"] = presign_s3_url(card.get("image_key"))
    card["notes_image_url"] = presign_s3_url(card.get("notes_image_key"))

    return {"success": True, "card": card}


@router.get("")
def list_cards(
    deck_id: str,
    current_user: dict = Depends(get_current_user),
):
    ensure_owned_deck(deck_id, current_user["user_id"])

    response = (
        supabase.table("cards")
        .select("*")
        .eq("deck_id", deck_id)
        .order("card_order")
        .execute()
    )

    cards = response.data or []
    for card in cards:
        card["image_url"] = presign_s3_url(card.get("image_key"))
        card["notes_image_url"] = presign_s3_url(card.get("notes_image_key"))

    return {"success": True, "cards": cards}


@router.get("/image-urls")
def get_image_urls(
    deck_id: str,
    current_user: dict = Depends(get_current_user),
):
    import time
    ensure_owned_deck(deck_id, current_user["user_id"])

    response = (
        supabase.table("cards")
        .select("card_id, image_key, notes_image_key")
        .eq("deck_id", deck_id)
        .execute()
    )

    cards = response.data or []
    for card in cards:
        card["image_url"] = presign_s3_url(card.get("image_key"))
        card["notes_image_url"] = presign_s3_url(card.get("notes_image_key"))

    return {
        "success": True, 
        "generated_at": int(time.time() * 1000),
        "cards": cards
    }


@router.put("/{card_id}")
def update_card(
    deck_id: str,
    card_id: str,
    body: CardUpdate,
    current_user: dict = Depends(get_current_user),
):
    ensure_owned_deck(deck_id, current_user["user_id"])
    updates = body.model_dump(exclude_unset=True)
    
    # Map legacy URL fields to keys if provided
    if "image_url" in updates and "image_key" not in updates:
        updates["image_key"] = updates.pop("image_url")
    else:
        updates.pop("image_url", None)
        
    if "notes_image_url" in updates and "notes_image_key" not in updates:
        updates["notes_image_key"] = updates.pop("notes_image_url")
    else:
        updates.pop("notes_image_url", None)

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    response = (
        supabase.table("cards")
        .update(updates)
        .eq("card_id", card_id)
        .eq("deck_id", deck_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Card not found")

    card = response.data[0]
    card["image_url"] = presign_s3_url(card.get("image_key"))
    card["notes_image_url"] = presign_s3_url(card.get("notes_image_key"))

    return {"success": True, "card": card}


@router.delete("/{card_id}")
def delete_card(
    deck_id: str,
    card_id: str,
    current_user: dict = Depends(get_current_user),
):
    ensure_owned_deck(deck_id, current_user["user_id"])

    response = (
        supabase.table("cards")
        .delete()
        .eq("card_id", card_id)
        .eq("deck_id", deck_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Card not found")

    card = response.data[0]
    card["image_url"] = presign_s3_url(card.get("image_key"))
    card["notes_image_url"] = presign_s3_url(card.get("notes_image_key"))

    return {"success": True, "card": card}
