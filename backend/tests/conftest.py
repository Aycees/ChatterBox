import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.session import async_session_maker
from app.main import app
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.user import User

# ---- setup helpers (write directly via the admin/owner session, bypassing
# both RLS and the API, so each test only exercises the one thing it's
# actually testing). Shared across test modules since both REST and
# WebSocket tests need the same "make me a user/room/membership" setup. ----


async def make_user(admin_db_session, **overrides):
    unique = uuid.uuid4().hex[:8]
    defaults = {
        "id": uuid.uuid4(),
        "username": f"user-{unique}",
        "email": f"{unique}@example.com",
        "password_hash": hash_password("irrelevant"),
    }
    user = User(**{**defaults, **overrides})
    admin_db_session.add(user)
    await admin_db_session.commit()
    await admin_db_session.refresh(user)
    return user


def auth_headers(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


async def make_room(admin_db_session, owner, is_private=False, name="Room"):
    room = Room(id=uuid.uuid4(), name=name, is_private=is_private, owner_id=owner.id)
    admin_db_session.add(room)
    await admin_db_session.commit()
    await admin_db_session.refresh(room)
    return room


async def add_member(admin_db_session, room, user, role="member"):
    membership = RoomMember(room_id=room.id, user_id=user.id, role=role)
    admin_db_session.add(membership)
    await admin_db_session.commit()
    return membership

# Cleanup needs to run as the owner role, not app_user: app_user only has
# DELETE granted on `rooms` (least privilege, per section 4.4), and RLS is
# forced on rooms/room_members/messages, so app_user's own view of those
# tables is filtered by policies anyway. The owner role bypasses both.
_admin_engine = create_async_engine(settings.database_url, future=True)
_admin_session_maker = async_sessionmaker(_admin_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session():
    async with async_session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def admin_db_session():
    async with _admin_session_maker() as session:
        yield session


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    yield
    async with _admin_session_maker() as session:
        for table in ("messages", "room_members", "rooms", "users"):
            await session.execute(text(f"DELETE FROM {table}"))
        await session.commit()
