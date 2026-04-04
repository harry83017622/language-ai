"""Tests for article generation and CRUD endpoints."""

import json
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient


@pytest.fixture
def mock_article_response(mock_openai):
    """Configure OpenAI mock to return a valid article response."""
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.content = json.dumps({
        "title": "A Day at Work",
        "sentences": [
            {"speaker": None, "text": "Today was a busy day.", "chinese": "今天是忙碌的一天。"},
            {"speaker": None, "text": "I had many meetings.", "chinese": "我開了很多會議。"},
        ],
        "used_words": ["busy", "meetings"],
    })
    mock_openai.chat.completions.create.return_value = response
    return mock_openai


@pytest.mark.asyncio
async def test_generate_article(client: AsyncClient, mock_article_response):
    res = await client.post("/api/generate-article", json={
        "words": ["busy", "meetings", "deadline"],
        "mode": "article",
        "ratio": 0.9,
    })
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "A Day at Work"
    assert len(data["sentences"]) == 2
    assert data["sentences"][0]["chinese"] == "今天是忙碌的一天。"
    assert "busy" in data["used_words"]


@pytest.mark.asyncio
async def test_save_and_load_article(client: AsyncClient):
    # Save
    save_res = await client.post("/api/articles", json={
        "title": "Saved Article",
        "input_words": ["hello", "world"],
        "mode": "article",
        "ratio": 0.9,
        "sentences": [
            {"text": "Hello world.", "chinese": "你好世界。"},
        ],
        "used_words": ["hello", "world"],
    })
    assert save_res.status_code == 200
    article_id = save_res.json()["id"]

    # List
    list_res = await client.get("/api/articles")
    assert list_res.status_code == 200
    assert any(a["id"] == article_id for a in list_res.json())

    # Get
    get_res = await client.get(f"/api/articles/{article_id}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "Saved Article"
    assert get_res.json()["input_words"] == ["hello", "world"]

    # Delete
    del_res = await client.delete(f"/api/articles/{article_id}")
    assert del_res.status_code == 200

    get_res2 = await client.get(f"/api/articles/{article_id}")
    assert get_res2.status_code == 404
