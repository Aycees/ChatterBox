import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.session import async_session_maker
from app.main import app


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session():
    async with async_session_maker() as session:
        yield session


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    yield
    async with async_session_maker() as session:
        for table in ("messages", "room_members", "rooms", "users"):
            await session.execute(text(f"DELETE FROM {table}"))
        await session.commit()
