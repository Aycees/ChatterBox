import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

InviteStatus = Literal["pending", "accepted", "declined"]


class InviteCreate(BaseModel):
    invited_user_id: uuid.UUID


class InviteOut(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    invited_user_id: uuid.UUID
    invited_by_id: uuid.UUID
    status: InviteStatus
    created_at: datetime
    responded_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class InviteWithDetailsOut(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    room_name: str
    invited_by_id: uuid.UUID
    invited_by_username: str
    status: InviteStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
