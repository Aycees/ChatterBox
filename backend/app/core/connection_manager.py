# app/core/connection_manager.py
import uuid
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # WebSocket -> the user_id it authenticated as. A plain
        # set[WebSocket] (as spec 5.2 sketches it) is enough for broadcast,
        # but online_user_ids() below needs to know *whose* connection each
        # one is, to answer "who's currently online" for a client that
        # joins after everyone else already has.
        self.rooms: dict[uuid.UUID, dict[WebSocket, uuid.UUID]] = {}

    def connect(self, room_id: uuid.UUID, websocket: WebSocket, user_id: uuid.UUID) -> None:
        self.rooms.setdefault(room_id, {})[websocket] = user_id

    def disconnect(self, room_id: uuid.UUID, websocket: WebSocket) -> None:
        connections = self.rooms.get(room_id)
        if connections is None:
            return
        connections.pop(websocket, None)
        if not connections:
            del self.rooms[room_id]

    def online_user_ids(self, room_id: uuid.UUID) -> set[uuid.UUID]:
        # A user with two tabs open has two connections but is one "online"
        # user -- the dict-of-values already collapses that via set().
        return set(self.rooms.get(room_id, {}).values())

    async def broadcast(
        self, room_id: uuid.UUID, envelope: dict, exclude: WebSocket | None = None
    ) -> None:
        # list(...) snapshots the connections before awaiting anything:
        # send_json below yields control, and a concurrent connect()/
        # disconnect() on this same room (another connection joining, or
        # its receive loop noticing a disconnect) mutates self.rooms[room_id]
        # in place -- iterating the live dict instead would risk "dict
        # changed size during iteration". A per-connection try/except means
        # one dead socket failing to send doesn't stop the rest of the room
        # from getting the message.
        for connection in list(self.rooms.get(room_id, {})):
            if connection is exclude:
                continue
            try:
                await connection.send_json(envelope)
            except Exception:
                pass


manager = ConnectionManager()
