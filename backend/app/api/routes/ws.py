import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pydantic import ValidationError
from sqlalchemy import select, text

from app.core.connection_manager import manager
from app.core.ws_tickets import tickets
from app.db.session import async_session_maker
from app.models.message import Message
from app.models.user import User
from app.schemas.message import MessageOut
from app.schemas.ws import IncomingEnvelope, MessagePayload

router = APIRouter()


async def _set_current_user(session, user_id: uuid.UUID) -> None:
    await session.execute(
        text("SELECT set_config('app.current_user_id', :user_id, true)"),
        {"user_id": str(user_id)},
    )


async def _authenticate(websocket: WebSocket, room_id: uuid.UUID) -> User | None:
    """Validate the WS ticket before the handshake completes.

    Room membership was already proven once, under normal JWT auth, when
    the ticket was minted via POST /rooms/{room_id}/ws-ticket (spec 5.2).
    This only has to confirm the ticket is real, matches this room, and
    hasn't expired or been used already -- consuming it either way, so it
    can never be replayed. Returns the authenticated user, or None after
    already closing the socket with 1008. Must run before accept(): an
    unauthorized caller is rejected outright, never accepted and then
    disconnected.
    """
    ticket = websocket.query_params.get("ticket")
    if ticket is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None

    user_id = tickets.consume(ticket, room_id)
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None

    async with async_session_maker() as session:
        await _set_current_user(session, user_id)

        user = (
            await session.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        if user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return None

    return user


async def _persist_message(user_id: uuid.UUID, room_id: uuid.UUID, content: str) -> Message:
    async with async_session_maker() as session:
        await _set_current_user(session, user_id)
        message = Message(room_id=room_id, sender_id=user_id, content=content)
        session.add(message)
        await session.commit()
        return message


async def _send_error(websocket: WebSocket, detail: str) -> None:
    await websocket.send_json({"type": "error", "payload": {"detail": detail}})


@router.websocket("/ws/rooms/{room_id}")
async def room_socket(websocket: WebSocket, room_id: uuid.UUID) -> None:
    user = await _authenticate(websocket, room_id)
    if user is None:
        return

    await websocket.accept()

    # Snapshot who's already online *before* adding this connection, so a
    # client that joins after everyone else can still learn who's already
    # here. The wire format stays exactly spec 5.2's "presence" envelope --
    # this just replays one per already-online user directly to the new
    # connection, rather than adding a new envelope type; a client can't
    # tell a backfilled "online" apart from a live one, and doesn't need
    # to. Without this, a client only ever learns about join/leave deltas
    # that happen *after* it connects, so its own view of "who's online"
    # silently understates reality for anyone who joined a room already in
    # progress.
    already_online = manager.online_user_ids(room_id) - {user.id}
    manager.connect(room_id, websocket, user.id)

    for other_user_id in already_online:
        await websocket.send_json(
            {"type": "presence", "payload": {"user_id": str(other_user_id), "status": "online"}}
        )

    await manager.broadcast(
        room_id,
        {"type": "presence", "payload": {"user_id": str(user.id), "status": "online"}},
    )

    try:
        while True:
            try:
                raw = await websocket.receive_json()
                envelope = IncomingEnvelope.model_validate(raw)
            except ValueError:
                # covers both malformed JSON (receive_json) and a payload
                # that doesn't match IncomingEnvelope (model_validate)
                await _send_error(websocket, "malformed envelope")
                continue

            if envelope.type == "message":
                try:
                    message_payload = MessagePayload.model_validate(envelope.payload)
                except ValidationError:
                    await _send_error(
                        websocket, "content must be 1-4000 characters"
                    )
                    continue

                message = await _persist_message(user.id, room_id, message_payload.content)
                await manager.broadcast(
                    room_id,
                    {
                        "type": "message",
                        "payload": MessageOut.model_validate(message).model_dump(mode="json"),
                    },
                )

            elif envelope.type == "typing":
                await manager.broadcast(
                    room_id,
                    {"type": "typing", "payload": {"user_id": str(user.id)}},
                    exclude=websocket,
                )

            else:
                await _send_error(websocket, f"unknown event type: {envelope.type}")

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_id, websocket)
        await manager.broadcast(
            room_id,
            {"type": "presence", "payload": {"user_id": str(user.id), "status": "offline"}},
        )
