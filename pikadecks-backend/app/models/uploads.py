from pydantic import BaseModel


class UploadProcessBody(BaseModel):
    file_url: str
    file_name: str | None = None
    file_type: str | None = None
    num_cards: int | None = 10
    timezone: str | None = None


class NotesProcessBody(BaseModel):
    title: str | None = None
    notes: str
    num_cards: int | None = 10


class ImagePresignBody(BaseModel):
    file_name: str
    content_type: str | None = "image/png"

