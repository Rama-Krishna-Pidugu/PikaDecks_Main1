from pydantic import BaseModel


class DeckCreate(BaseModel):
    title: str
    description: str | None = None
    notes_content: str | None = None
    notes_image_urls: list[str] | None = None


class DeckUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    notes_content: str | None = None
    notes_image_urls: list[str] | None = None

