from pydantic import BaseModel, Field


class IncomingEnvelope(BaseModel):
    """Shape of any client -> server frame, before we know its `type`."""

    type: str
    payload: dict = Field(default_factory=dict)


class MessagePayload(BaseModel):
    """Payload shape required for a `type: "message"` envelope."""

    content: str = Field(min_length=1, max_length=4000)


class WsTicketOut(BaseModel):
    """Response for POST /rooms/{room_id}/ws-ticket."""

    ticket: str
    expires_in: int
