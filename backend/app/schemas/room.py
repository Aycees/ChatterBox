import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    is_private: bool = False


class RoomJoinRequest(BaseModel):
    # Omitted -> caller is joining themself (only works for public rooms,
    # per room_members_insert). Set -> caller must already be a member,
    # adding someone else to a room they belong to (the private-room path).
    user_id: uuid.UUID | None = None


class RoomOut(BaseModel):
    id: uuid.UUID
    name: str
    is_private: bool
    owner_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoomMemberOut(BaseModel):
    room_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)
