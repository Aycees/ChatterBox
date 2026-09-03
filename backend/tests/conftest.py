import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.session import async_session_maker
from app.main import app

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
