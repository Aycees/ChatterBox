import secrets
import time
import uuid

TICKET_TTL_SECONDS = 30


class _Ticket:
    __slots__ = ("user_id", "room_id", "expires_at")

    def __init__(self, user_id: uuid.UUID, room_id: uuid.UUID, expires_at: float) -> None:
        self.user_id = user_id
        self.room_id = room_id
        self.expires_at = expires_at


class TicketStore:
    """Short-lived, single-use tickets for opening a room's WebSocket.

    Keeps the long-lived JWT out of the WS URL (query strings end up in
    access/proxy logs and browser history, spec section 5.2). A ticket
    only proves "this user was a member of this room a few seconds ago";
    membership itself is checked once, by the REST caller, in issue().

    In-memory and per-process, same as ConnectionManager: running more
    than one API process needs shared storage for this too (section 8's
    Redis stretch goal).
    """

    def __init__(self, ttl_seconds: float = TICKET_TTL_SECONDS) -> None:
        self._tickets: dict[str, _Ticket] = {}
        self._ttl_seconds = ttl_seconds

    def issue(self, user_id: uuid.UUID, room_id: uuid.UUID) -> str:
        self._sweep_expired()
        ticket = secrets.token_urlsafe(32)
        self._tickets[ticket] = _Ticket(
            user_id=user_id, room_id=room_id, expires_at=time.monotonic() + self._ttl_seconds
        )
        return ticket

    def consume(self, ticket: str, room_id: uuid.UUID) -> uuid.UUID | None:
        """Validate and immediately invalidate a ticket. One-shot by design."""
        record = self._tickets.pop(ticket, None)
        if record is None:
            return None
        if record.room_id != room_id or record.expires_at < time.monotonic():
            return None
        return record.user_id

    def _sweep_expired(self) -> None:
        now = time.monotonic()
        expired = [t for t, record in self._tickets.items() if record.expires_at < now]
        for t in expired:
            del self._tickets[t]


tickets = TicketStore()
