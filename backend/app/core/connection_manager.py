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
        for connection in self.rooms.get(room_id, set()):
            if connection is exclude:
                continue
            await connection.send_json(envelope)


manager = ConnectionManager()
