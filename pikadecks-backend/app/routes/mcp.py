import os
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
import jwt

from app.database import supabase
from app.services.entitlements import get_user_plan, _day_bounds
from app.services.s3_utils import presign_s3_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["mcp"])


def _count_mcp_decks_created_today(user_id: str, client_id: str) -> int:
    start, end = _day_bounds()
    res = (
        supabase.table("mcp_usage_events")
        .select("id")
        .eq("user_id", user_id)
        .eq("client_id", client_id)
        .gte("created_at", start)
        .lt("created_at", end)
        .execute()
    )
    return len(res.data or [])


class McpDeckCreate(BaseModel):
    title: str
    description: str = ""


class McpFlashcard(BaseModel):
    front: str | None = None
    back: str | None = None
    question: str | None = None
    answer: str | None = None
    explanation: str | None = None
    image_key: str | None = None
    notes_image_key: str | None = None


class McpFlashcardsCreate(BaseModel):
    flashcards: list[McpFlashcard]
    idempotency_key: str | None = None


def get_current_mcp_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization")
    logger.info(f"get_current_mcp_user Authorization header: {auth_header}")
    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning(f"get_current_mcp_user failed: header format mismatch (starts with Bearer? {bool(auth_header and auth_header.startswith('Bearer '))})")
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split("Bearer ")[1]
    jwt_secret = os.getenv("OAUTH_JWT_SECRET")
    if not jwt_secret:
        logger.error("get_current_mcp_user failed: OAUTH_JWT_SECRET not configured")
        raise HTTPException(status_code=500, detail="OAuth signature configuration missing")

    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False, "verify_iss": False}
        )
        iss = payload.get("iss")
        aud = payload.get("aud")
        logger.info(f"get_current_mcp_user verify success: payload={payload}")
        if iss not in ("pikadecks", "https://mcp.pikadecks.app/"):
            logger.warning(f"get_current_mcp_user failed: invalid iss={iss}")
            raise HTTPException(status_code=401, detail="Invalid token issuer")
        if aud not in ("pikadecks-mcp", "https://mcp.pikadecks.app/"):
            logger.warning(f"get_current_mcp_user failed: invalid aud={aud}")
            raise HTTPException(status_code=401, detail="Invalid token audience")
        user_id = payload.get("sub")
        client_id = payload.get("client_id")
        if not user_id:
            logger.warning("get_current_mcp_user failed: missing sub claim")
            raise HTTPException(status_code=401, detail="Token subject claim is missing")
        return {"user_id": user_id, "scope": payload.get("scope", ""), "client_id": client_id}
    except jwt.ExpiredSignatureError:
        logger.warning("get_current_mcp_user failed: token expired")
        raise HTTPException(status_code=401, detail="Access token has expired")
    except jwt.InvalidTokenError as e:
        logger.warning(f"get_current_mcp_user failed: invalid token: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid access token: {str(e)}")


@router.get("/limits")
def mcp_limits(current_user: dict = Depends(get_current_mcp_user)):
    user_id = current_user["user_id"]
    client_id = current_user.get("client_id", "unknown") or "unknown"
    plan = get_user_plan(user_id)
    
    decks_created = _count_mcp_decks_created_today(user_id, client_id)
    max_decks = 10 if plan == "free" else 999999
    remaining_decks = max(0, max_decks - decks_created)
    
    logger.info({
        "event": "mcp_limits",
        "user_id": user_id,
        "client_id": client_id,
        "plan": plan,
        "decks_created_today": decks_created,
        "decks_remaining_today": remaining_decks,
    })
    
    return {
        "plan": plan,
        "client_id": client_id,
        "decks_created_today": decks_created,
        "max_decks_per_day": max_decks,
        "decks_remaining_today": remaining_decks,
        "max_cards_per_request": 50 if plan == "free" else 150
    }


@router.get("/decks")
def mcp_list_decks(current_user: dict = Depends(get_current_mcp_user)):
    user_id = current_user["user_id"]

    res = (
        supabase.table("decks")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    decks = res.data or []
    if decks:
        deck_ids = [d["deck_id"] for d in decks]
        cards_res = (
            supabase.table("cards")
            .select("card_id, deck_id")
            .in_("deck_id", deck_ids)
            .execute()
        )
        from collections import Counter
        counts = Counter(c["deck_id"] for c in cards_res.data or [])
        for d in decks:
            d["card_count"] = counts[d["deck_id"]]
    else:
        decks = []

    return {
        "success": True,
        "decks": decks
    }


@router.get("/decks/{deck_id}")
def mcp_get_deck(deck_id: str, current_user: dict = Depends(get_current_mcp_user)):
    user_id = current_user["user_id"]

    logger.info(f"deck_id raw={deck_id}")
    logger.info(f"deck_id repr={repr(deck_id)}")
    logger.info(f"deck_id type={type(deck_id)}")
    logger.info(f"user_id raw={user_id}")
    logger.info(f"user_id repr={repr(user_id)}")
    logger.info(f"user_id type={type(user_id)}")

    res = (
        supabase.table("decks")
        .select("*")
        .eq("deck_id", deck_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not res.data:
        raise HTTPException(status_code=404, detail="Deck not found")

    # Count cards in this deck
    count_res = (
        supabase.table("cards")
        .select("card_id")
        .eq("deck_id", deck_id)
        .execute()
    )
    card_count = len(count_res.data or [])

    deck_data = res.data[0]
    deck_data["card_count"] = card_count

    return {
        "success": True,
        "deck": deck_data
    }


@router.post("/decks")
def mcp_create_deck(body: McpDeckCreate, current_user: dict = Depends(get_current_mcp_user)):
    user_id = current_user["user_id"]
    client_id = current_user.get("client_id", "unknown") or "unknown"
    plan = get_user_plan(user_id)

    decks_created = _count_mcp_decks_created_today(user_id, client_id)
    if plan == "free" and decks_created >= 10:
        raise HTTPException(
            status_code=403,
            detail=f"Daily deck limit reached. Your free plan allows up to 10 decks per day per client. You have already created {decks_created} today."
        )

    res = (
        supabase.table("decks")
        .insert({
            "user_id": user_id,
            "title": body.title,
            "description": body.description
        })
        .execute()
    )

    return {
        "success": True,
        "deck": res.data[0] if res.data else None
    }


@router.post("/decks/{deck_id}/flashcards")
def mcp_save_flashcards(deck_id: str, body: McpFlashcardsCreate, current_user: dict = Depends(get_current_mcp_user)):
    user_id = current_user["user_id"]
    client_id = current_user.get("client_id", "unknown") or "unknown"

    # Check idempotency key first if provided
    if body.idempotency_key:
        try:
            existing_log = supabase.table("mcp_request_log").select("*").eq("idempotency_key", body.idempotency_key).execute()
            if existing_log.data:
                log_record = existing_log.data[0]
                if log_record["status"] == "success":
                    return log_record["response"]
                else:
                    raise HTTPException(status_code=500, detail="Previous attempt failed. Please try with a new idempotency key.")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking idempotency log: {e}")

    # Verify deck exists and belongs to system user
    deck_res = (
        supabase.table("decks")
        .select("deck_id")
        .eq("deck_id", deck_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not deck_res.data:
        raise HTTPException(status_code=404, detail="Deck not found or does not belong to the authorized user")

    if not body.flashcards:
        return {"success": True, "cards_created": 0}

    # Enforce daily and request limits
    plan = get_user_plan(user_id)
    num_requested = len(body.flashcards)
    warning_message = None

    if plan == "free":
        if num_requested > 50:
            warning_message = f"We generated {num_requested} flashcards, but only the first 50 have been saved to your account. To access and save all flashcards, please upgrade to the Pro version."
            body.flashcards = body.flashcards[:50]
    elif plan in ("pro", "premium"):
        if num_requested > 150:
            raise HTTPException(
                status_code=403,
                detail=f"Your premium plan allows up to 150 flashcards per request. You requested {num_requested}."
            )

    # Prepare bulk insert and validate fields
    cards_to_insert = []
    for idx, card in enumerate(body.flashcards):
        q = card.question or card.front
        a = card.answer or card.back
        exp = card.explanation.strip() if card.explanation else None

        if not q or not q.strip():
            raise HTTPException(
                status_code=400,
                detail=f"Flashcard validation failed at index {idx}: 'question' or 'front' field is empty or missing"
            )
        if not a or not a.strip():
            raise HTTPException(
                status_code=400,
                detail=f"Flashcard validation failed at index {idx}: 'answer' or 'back' field is empty or missing"
            )

        cards_to_insert.append({
            "deck_id": deck_id,
            "question": q.strip(),
            "answer": a.strip(),
            "explanation": exp,
            "image_key": card.image_key,
            "notes_image_key": card.notes_image_key,
            "card_order": idx + 1
        })

    # Insert cards
    res = supabase.table("cards").insert(cards_to_insert).execute()
    inserted_cards = res.data or []
    inserted_card_ids = [c["card_id"] for c in inserted_cards]

    from app.services.srs import now_utc, iso
    immediate_due = now_utc() - timedelta(days=1)
    reviews_to_insert = [
        {
            "user_id": user_id,
            "deck_id": deck_id,
            "card_id": c["card_id"],
            "ease_factor": 2.5,
            "interval_days": 0,
            "repetitions": 0,
            "lapses": 0,
            "review_count": 0,
            "learning_state": "new",
            "next_review_at": iso(immediate_due),
        }
        for c in inserted_cards
    ]

    # Try inserting reviews, roll back cards and reviews on failure
    try:
        if reviews_to_insert:
            supabase.table("reviews").insert(reviews_to_insert).execute()
    except Exception as e:
        if inserted_card_ids:
            try:
                supabase.table("reviews").delete().in_("card_id", inserted_card_ids).execute()
            except Exception:
                pass
            try:
                supabase.table("cards").delete().in_("card_id", inserted_card_ids).execute()
            except Exception:
                pass
        logger.error(f"Failed to create review records. Rolled back all changes: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to initialize study/review state for flashcards. All changes rolled back."
        )

    # Insert successful usage event first
    try:
        supabase.table("mcp_usage_events").insert({
            "user_id": user_id,
            "client_id": client_id,
            "deck_id": deck_id,
            "cards_created": len(inserted_cards)
        }).execute()
    except Exception as e:
        logger.error(f"Failed to record MCP usage event: {e}")

    decks_created = _count_mcp_decks_created_today(user_id, client_id)
    max_decks = 10 if plan == "free" else 999999
    remaining_decks = max(0, max_decks - decks_created)

    resp = {
        "success": True,
        "cards_created": len(inserted_cards),
        "reviews_created": len(reviews_to_insert),
        "decks_created_today": decks_created,
        "decks_remaining_today": remaining_decks
    }
    if warning_message:
        resp["warning_message"] = warning_message

    # Write success to idempotency log
    if body.idempotency_key:
        try:
            supabase.table("mcp_request_log").insert({
                "idempotency_key": body.idempotency_key,
                "user_id": user_id,
                "client_id": client_id,
                "status": "success",
                "response": resp
            }).execute()
        except Exception as e:
            logger.error(f"Failed to save to mcp_request_log: {e}")

    return resp


@router.get("/decks/{deck_id}/cards")
def mcp_get_deck_cards(
    deck_id: str,
    limit: int = 100,
    offset: int = 0,
    current_user: dict = Depends(get_current_mcp_user)
):
    user_id = current_user["user_id"]

    # Verify deck exists and belongs to system user
    deck_res = (
        supabase.table("decks")
        .select("*")
        .eq("deck_id", deck_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not deck_res.data:
        raise HTTPException(status_code=404, detail="Deck not found or does not belong to the authorized user")

    deck_title = deck_res.data[0].get("title", "Unknown")

    # Fetch total count
    count_res = (
        supabase.table("cards")
        .select("card_id")
        .eq("deck_id", deck_id)
        .execute()
    )
    total_count = len(count_res.data or [])

    # Fetch paginated cards
    cards_res = (
        supabase.table("cards")
        .select("*")
        .eq("deck_id", deck_id)
        .order("card_order", desc=False)
        .range(offset, offset + limit - 1)
        .execute()
    )
    cards = cards_res.data or []
    for card in cards:
        card["image_url"] = presign_s3_url(card.get("image_key"))
        card["notes_image_url"] = presign_s3_url(card.get("notes_image_key"))

    return {
        "success": True,
        "deck_id": deck_id,
        "deck_title": deck_title,
        "card_count": total_count,
        "cards": cards
    }
