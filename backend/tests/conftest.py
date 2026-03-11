"""Shared test fixtures for nasOS backend tests."""

import asyncio
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.core.config import settings
from app.core.database import engine, init_db
from app.main import app


# Use a temporary database for tests
@pytest.fixture(scope="session", autouse=True)
def _setup_test_db(tmp_path_factory):
    """Point the DB to a temp file for the entire test session."""
    tmp = tmp_path_factory.mktemp("data")
    settings.db_path = tmp / "test.db"
    settings.data_dir = tmp


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db():
    """Initialize a fresh database for each test."""
    await init_db()
    yield
    # Cleanup: drop all tables
    async with engine.begin() as conn:
        from app.models.base import Base
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(db):
    """Async HTTP client wired to the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient):
    """Authenticated HTTP client — logs in as admin and adds JWT header."""
    resp = await client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123",
    })
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    yield client
