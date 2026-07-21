from fastapi import APIRouter, Depends, Query

from app.models.reviews import ReviewCreate, ReviewRatingCreate
from app.services.get_current_user import get_current_user
from app.services.srs import (
    get_review_overview,
    start_review_session,
    submit_review_rating,
)


router = APIRouter(tags=["reviews"])


@router.get("/reviews/session")
def start_session(
    deck_id: str = Query(...),
    limit: int = Query(50, ge=1, le=10000),
    current_user: dict = Depends(get_current_user),
):
    """Return prioritized review cards for the selected deck or decks."""
    return start_review_session(
        user_id=current_user["user_id"],
        deck_id=deck_id,
        limit=limit,
    )


@router.post("/reviews/{card_id}")
def submit_rating(
    card_id: str,
    body: ReviewRatingCreate,
    current_user: dict = Depends(get_current_user),
):
    """Apply one review rating and return the updated SRS schedule."""
    return submit_review_rating(
        user_id=current_user["user_id"],
        card_id=card_id,
        deck_id=body.deck_id,
        rating=body.rating,
        reviewed_client_at=body.reviewed_at,
    )


@router.post("/reviews")
def record_review_compat(
    body: ReviewCreate,
    current_user: dict = Depends(get_current_user),
):
    """Compatibility endpoint for older clients and offline queues."""
    return submit_review_rating(
        user_id=current_user["user_id"],
        card_id=body.card_id,
        deck_id=body.deck_id,
        rating=body.rating,
        reviewed_client_at=body.reviewed_at,
    )


@router.get("/reviews/overview")
def review_overview(current_user: dict = Depends(get_current_user)):
    return {"success": True, **get_review_overview(current_user["user_id"])}
