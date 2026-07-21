from pydantic import BaseModel


class ReviewCreate(BaseModel):
    card_id: str
    deck_id: str | None = None
    rating: str
    reviewed_at: str | None = None


class ReviewRatingCreate(BaseModel):
    deck_id: str | None = None
    rating: str
    reviewed_at: str | None = None


class ReviewSessionQuery(BaseModel):
    deck_id: str
    limit: int = 20
