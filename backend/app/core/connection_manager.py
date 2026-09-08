# app/core/connection_manager.py
import uuid
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[uuid.UUID, set[WebSocket]] = {}

    def connect(self, room_id: uuid.UUID, websocket: WebSocket) -> None:
        self.rooms.setdefault(room_id, set()).add(websocket)

    def disconnect(self, room_id: uuid.UUID, websocket: WebSocket) -> None:
        connections = self.rooms.get(room_id)
        if connections is None:
            return
        connections.discard(websocket)
        if not connections:
            del self.rooms[room_id]

    async def broadcast(
        self, room_id: uuid.UUID, envelope: dict, exclude: WebSocket | None = None
    ) -> None:
        # list(...) snapshots the set before awaiting anything: send_json
        # below yields control, and a concurrent connect()/disconnect() on
        # this same room (another connection joining, or its receive loop
        # noticing a disconnect) mutates self.rooms[room_id] in place --
        # iterating the live set instead would risk "Set changed size
        # during iteration". A per-connection try/except means one dead
        # socket failing to send doesn't stop the rest of the room from
        # getting the message.
        for connection in list(self.rooms.get(room_id, set())):
            if connection is exclude:
                continue
            try:
                await connection.send_json(envelope)
            except Exception:
                pass


manager = ConnectionManager()
