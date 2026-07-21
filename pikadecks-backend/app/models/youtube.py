from pydantic import BaseModel


class YouTubeGenerateBody(BaseModel):
    url: str
    num_cards: int | None = 10
    title: str | None = None
    languages: list[str] | None = None

