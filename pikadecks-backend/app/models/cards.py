from pydantic import BaseModel


class CardCreate(BaseModel):
    question: str
    answer: str
    explanation: str | None = None
    difficulty: str = "medium"
    card_type: str = "text"
    image_url: str | None = None
    notes_image_url: str | None = None
    image_key: str | None = None
    notes_image_key: str | None = None
    card_order: int = 0


class CardUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    explanation: str | None = None
    difficulty: str | None = None
    card_type: str | None = None
    image_url: str | None = None
    notes_image_url: str | None = None
    image_key: str | None = None
    notes_image_key: str | None = None
    card_order: int | None = None
