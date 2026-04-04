"""Tests for review flashcard, logging, and statistics endpoints."""

import pytest
from httpx import AsyncClient


async def _create_words(client: AsyncClient) -> list[str]:
    """Helper: create a word group and return word IDs."""
    res = await client.post("/api/word-groups", json={
        "title": "Review Test",
        "saved_date": "2026-04-04",
        "words": [
            {"english": "cat", "chinese": "貓"},
            {"english": "dog", "chinese": "狗"},
            {"english": "bird", "chinese": "鳥"},
        ],
    })
    return [w["id"] for w in res.json()["words"]]


@pytest.mark.asyncio
async def test_get_review_words(client: AsyncClient):
    await _create_words(client)

    res = await client.get("/api/review/words", params={"source": "all", "count": 10})
    assert res.status_code == 200
    data = res.json()
    assert len(data) <= 10
    assert all("english" in w for w in data)


@pytest.mark.asyncio
async def test_log_review(client: AsyncClient):
    word_ids = await _create_words(client)

    res = await client.post("/api/review/log", json={
        "word_id": word_ids[0],
        "result": "forget",
    })
    assert res.status_code == 200
    assert res.json()["ok"] is True


@pytest.mark.asyncio
async def test_review_stats(client: AsyncClient):
    word_ids = await _create_words(client)

    # Log some reviews
    await client.post("/api/review/log", json={"word_id": word_ids[0], "result": "forget"})
    await client.post("/api/review/log", json={"word_id": word_ids[1], "result": "remember"})
    await client.post("/api/review/log", json={"word_id": word_ids[2], "result": "unsure"})

    res = await client.get("/api/review/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["total_reviews"] == 3
    assert data["forget_count"] == 1
    assert data["remember_count"] == 1
    assert data["unsure_count"] == 1
    assert "forget_words" in data
    assert "weekly_trend" in data


@pytest.mark.asyncio
async def test_review_export(client: AsyncClient):
    word_ids = await _create_words(client)
    await client.post("/api/review/log", json={"word_id": word_ids[0], "result": "forget"})
    await client.post("/api/review/log", json={"word_id": word_ids[0], "result": "forget"})

    res = await client.get("/api/review/export", params={
        "result_type": "forget",
        "period": "all",
        "limit": 10,
    })
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert data[0]["english"] == "cat"
    assert data[0]["count"] == 2


@pytest.mark.asyncio
async def test_weighted_selection_favors_forgotten_words(client: AsyncClient):
    word_ids = await _create_words(client)

    # Mark one word as forgotten many times
    for _ in range(10):
        await client.post("/api/review/log", json={"word_id": word_ids[0], "result": "forget"})
    # Mark others as remembered
    for wid in word_ids[1:]:
        await client.post("/api/review/log", json={"word_id": wid, "result": "remember"})

    # Sample multiple times and check forgotten word appears more
    appearances = {wid: 0 for wid in word_ids}
    for _ in range(20):
        res = await client.get("/api/review/words", params={"source": "all", "count": 2})
        for w in res.json():
            if w["id"] in appearances:
                appearances[w["id"]] += 1

    # Forgotten word (word_ids[0]) should appear more often
    assert appearances[word_ids[0]] >= appearances[word_ids[1]]
