"""Shared test fixtures.

Uses SQLite in-memory database (no PostgreSQL needed).
Mocks OpenAI API calls to avoid costs and network dependency.
"""

import os

# Set dummy env vars BEFORE any app imports
os.environ["OPENAI_API_KEY"] = "sk-test-dummy-key"
os.environ["GOOGLE_CLIENT_ID"] = "test-client-id"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["FILE_STORE_DIR"] = "/tmp/english_tool_test_files"

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base, User

# --- Database ---

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DB_URL, echo=False)
test_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Create all tables before each test, drop after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db():
    """Provide a test database session."""
    async with test_session() as session:
        yield session


# --- Test User ---

TEST_USER_ID = uuid.uuid4()


@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    """Create and return a test user."""
    user = User(
        id=TEST_USER_ID,
        google_id="test-google-id",
        email="test@example.com",
        name="Test User",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# --- Mock Auth ---

def _override_get_db():
    async def get_db():
        async with test_session() as session:
            yield session
    return get_db


def _override_get_current_user(user: User):
    async def get_current_user():
        return user
    return get_current_user


# --- App Client ---

@pytest_asyncio.fixture
async def client(test_user: User):
    """Create an async test client with auth and DB overrides."""
    from contextlib import asynccontextmanager
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from app.routers import article, auth, email, llm, review, words
    from app.database import get_db
    from app.auth import get_current_user

    # Create a test app WITHOUT the lifespan (no alembic)
    @asynccontextmanager
    async def test_lifespan(app):
        yield

    test_app = FastAPI(lifespan=test_lifespan)
    test_app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"],
    )
    test_app.include_router(article.router)
    test_app.include_router(auth.router)
    test_app.include_router(email.router)
    test_app.include_router(llm.router)
    test_app.include_router(review.router)
    test_app.include_router(words.router)

    test_app.dependency_overrides[get_db] = _override_get_db()
    test_app.dependency_overrides[get_current_user] = _override_get_current_user(test_user)

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# --- Mock OpenAI ---

@pytest.fixture(autouse=True)
def mock_openai():
    """Mock OpenAI API calls globally."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = '{"results": []}'

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    mock_client.audio.speech.create = AsyncMock(return_value=MagicMock(content=b"fake-mp3"))

    patches = []
    for module_path in [
        "app.services.llm_service.client",
        "app.routers.article.client",
        "app.services.audio_service.client",
    ]:
        try:
            p = patch(module_path, mock_client)
            p.start()
            patches.append(p)
        except (AttributeError, ModuleNotFoundError):
            pass

    # Mock pydub AudioSegment to avoid decoding fake MP3 bytes
    fake_segment = MagicMock()
    fake_segment.__len__ = lambda self: 1000  # 1 second
    fake_segment.__add__ = lambda self, other: self
    fake_segment.export = MagicMock()
    p_pydub = patch("app.services.audio_service.AudioSegment.from_mp3", return_value=fake_segment)
    p_pydub.start()
    patches.append(p_pydub)

    p_empty = patch("app.services.audio_service.AudioSegment.empty", return_value=fake_segment)
    p_empty.start()
    patches.append(p_empty)

    p_silent = patch("app.services.audio_service.AudioSegment.silent", return_value=fake_segment)
    p_silent.start()
    patches.append(p_silent)

    yield mock_client

    for p in patches:
        p.stop()
