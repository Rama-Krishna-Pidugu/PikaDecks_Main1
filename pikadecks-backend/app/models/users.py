from pydantic import BaseModel

class CreateUserBody(BaseModel):
    name: str | None = None
    email: str
    profile_pic: str | None = None