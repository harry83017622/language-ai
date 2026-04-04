"""Tests for word group CRUD and export endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_word_group(client: AsyncClient):
    res = await client.post("/api/word-groups", json={
        "title": "Test Group",
        "saved_date": "2026-04-04",
        "words": [
            {"english": "apple", "chinese": "蘋果", "kk_phonetic": "[ˈæpəl]"},
            {"english": "banana", "chinese": "香蕉"},
        ],
    })
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Test Group"
    assert len(data["words"]) == 2
    assert data["words"][0]["english"] == "apple"


@pytest.mark.asyncio
async def test_list_word_groups(client: AsyncClient):
    # Create a group first
    await client.post("/api/word-groups", json={
        "title": "List Test",
        "saved_date": "2026-04-04",
        "words": [{"english": "cat"}],
    })

    res = await client.get("/api/word-groups")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert data[0]["title"] == "List Test"


@pytest.mark.asyncio
async def test_list_word_groups_filter_by_title(client: AsyncClient):
    await client.post("/api/word-groups", json={
        "title": "TOEIC Lesson 1",
        "saved_date": "2026-04-04",
        "words": [{"english": "dog"}],
    })
    await client.post("/api/word-groups", json={
        "title": "Daily Words",
        "saved_date": "2026-04-04",
        "words": [{"english": "cat"}],
    })

    res = await client.get("/api/word-groups", params={"title": "TOEIC"})
    assert res.status_code == 200
    data = res.json()
    assert all("TOEIC" in g["title"] for g in data)


@pytest.mark.asyncio
async def test_get_word_group(client: AsyncClient):
    create_res = await client.post("/api/word-groups", json={
        "title": "Get Test",
        "saved_date": "2026-04-04",
        "words": [{"english": "fish", "chinese": "魚"}],
    })
    group_id = create_res.json()["id"]

    res = await client.get(f"/api/word-groups/{group_id}")
    assert res.status_code == 200
    assert res.json()["title"] == "Get Test"
    assert res.json()["words"][0]["chinese"] == "魚"


@pytest.mark.asyncio
async def test_update_word(client: AsyncClient):
    create_res = await client.post("/api/word-groups", json={
        "title": "Update Test",
        "saved_date": "2026-04-04",
        "words": [{"english": "old"}],
    })
    word_id = create_res.json()["words"][0]["id"]

    res = await client.put(f"/api/words/{word_id}", json={"english": "new", "chinese": "新的"})
    assert res.status_code == 200
    assert res.json()["english"] == "new"
    assert res.json()["chinese"] == "新的"


@pytest.mark.asyncio
async def test_delete_word_group(client: AsyncClient):
    create_res = await client.post("/api/word-groups", json={
        "title": "Delete Test",
        "saved_date": "2026-04-04",
        "words": [{"english": "bye"}],
    })
    group_id = create_res.json()["id"]

    res = await client.delete(f"/api/word-groups/{group_id}")
    assert res.status_code == 200

    get_res = await client.get(f"/api/word-groups/{group_id}")
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_search_words(client: AsyncClient):
    await client.post("/api/word-groups", json={
        "title": "Search Test",
        "saved_date": "2026-04-04",
        "words": [
            {"english": "application", "chinese": "應用程式"},
            {"english": "apple", "chinese": "蘋果"},
        ],
    })

    res = await client.get("/api/search-words", params={"q": "appl"})
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    assert all("appl" in w["english"].lower() for w in data)


@pytest.mark.asyncio
async def test_batch_mark_words(client: AsyncClient):
    create_res = await client.post("/api/word-groups", json={
        "title": "Mark Test",
        "saved_date": "2026-04-04",
        "words": [{"english": "mark1"}, {"english": "mark2"}],
    })
    word_ids = [w["id"] for w in create_res.json()["words"]]

    res = await client.put("/api/words/batch-mark", json={
        "word_ids": word_ids,
        "marked": True,
    })
    assert res.status_code == 200
    assert res.json()["updated"] == 2

    # Verify persistence
    group_id = create_res.json()["id"]
    get_res = await client.get(f"/api/word-groups/{group_id}")
    for w in get_res.json()["words"]:
        assert w["marked_for_review"] is True
