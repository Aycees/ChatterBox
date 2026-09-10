import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    email: EmailStr
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserDirectoryOut(BaseModel):
    """GET /users -- deliberately omits email. Search still filters on it
    server-side, but any authenticated user can query this endpoint for
    every other user, so returning email here would hand out everyone's
    address to anyone who asks, not just to someone who already knows it.
    """

    id: uuid.UUID
    username: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
