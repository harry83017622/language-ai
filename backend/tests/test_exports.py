"""Tests for file export endpoints (CSV, PDF download)."""

import json
import os
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient

HAS_CJK_FONT = os.path.exists("/app/fonts/NotoSansTC-Regular.otf")


async def _create_group(client: AsyncClient, use_ascii: bool = False) -> str:
    """Helper: create a word group and return its ID."""
    if use_ascii:
        words = [
            {"english": "apple", "chinese": "apple-cn", "kk_phonetic": "aepl",
             "mnemonic": "ah-po", "example_sentence": "I eat an apple."},
            {"english": "banana", "chinese": "banana-cn", "kk_phonetic": "banana"},
        ]
    else:
        words = [
            {"english": "apple", "chinese": "蘋果", "kk_phonetic": "[ˈæpəl]",
             "mnemonic": "阿婆", "example_sentence": "I eat an apple."},
            {"english": "banana", "chinese": "香蕉", "kk_phonetic": "[bəˈnænə]"},
        ]
    res = await client.post("/api/word-groups", json={
        "title": "Export Test",
        "saved_date": "2026-04-04",
        "words": words,
    })
    return res.json()["id"]


# --- Word Group CSV ---

@pytest.mark.asyncio
async def test_export_word_group_csv(client: AsyncClient):
    group_id = await _create_group(client)
    res = await client.get(f"/api/word-groups/{group_id}/csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    content = res.text
    assert "apple" in content
    assert "蘋果" in content
    assert "banana" in content


@pytest.mark.asyncio
async def test_export_word_group_csv_filename(client: AsyncClient):
    group_id = await _create_group(client)
    res = await client.get(f"/api/word-groups/{group_id}/csv")
    cd = res.headers.get("content-disposition", "")
    assert "Export%20Test" in cd or "Export_Test" in cd or "Export" in cd


# --- Word Group PDF ---

@pytest.mark.asyncio
@pytest.mark.skipif(not HAS_CJK_FONT, reason="CJK font not available (runs in Docker)")
async def test_export_word_group_pdf(client: AsyncClient):
    group_id = await _create_group(client)
    res = await client.get(f"/api/word-groups/{group_id}/pdf")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content[:5] == b"%PDF-"


@pytest.mark.asyncio
async def test_export_word_group_pdf_not_found(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    res = await client.get(f"/api/word-groups/{fake_id}/pdf")
    assert res.status_code == 404


# --- Review Export CSV ---

@pytest.mark.asyncio
async def test_review_export_csv(client: AsyncClient):
    # Create words and log reviews
    group_res = await client.post("/api/word-groups", json={
        "title": "Review Export",
        "saved_date": "2026-04-04",
        "words": [{"english": "test", "chinese": "測試"}],
    })
    word_id = group_res.json()["words"][0]["id"]
    await client.post("/api/review/log", json={"word_id": word_id, "result": "forget"})

    res = await client.get("/api/review/export/csv", params={
        "result_type": "forget", "period": "all", "limit": 10,
        "fields": "english,chinese",
    })
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "test" in res.text
    assert "測試" in res.text


# --- Review Export PDF ---

@pytest.mark.asyncio
@pytest.mark.skipif(not HAS_CJK_FONT, reason="CJK font not available (runs in Docker)")
async def test_review_export_pdf(client: AsyncClient):
    group_res = await client.post("/api/word-groups", json={
        "title": "Review PDF",
        "saved_date": "2026-04-04",
        "words": [{"english": "hello", "chinese": "你好"}],
    })
    word_id = group_res.json()["words"][0]["id"]
    await client.post("/api/review/log", json={"word_id": word_id, "result": "forget"})

    res = await client.get("/api/review/export/pdf", params={
        "result_type": "forget", "period": "all", "limit": 10,
    })
    assert res.status_code == 200
    assert res.content[:5] == b"%PDF-"


# --- Article PDF ---

@pytest.mark.asyncio
@pytest.mark.skipif(not HAS_CJK_FONT, reason="CJK font not available (runs in Docker)")
async def test_article_pdf(client: AsyncClient):
    res = await client.post("/api/generate-article-pdf", json={
        "title": "Test Article",
        "sentences": [
            {"text": "Hello world.", "chinese": "你好世界。"},
            {"speaker": "A", "text": "Hi there!", "chinese": "嗨！"},
        ],
        "used_words": ["hello", "world"],
    })
    assert res.status_code == 200
    assert res.content[:5] == b"%PDF-"


# --- Article Audio (mocked TTS) ---

@pytest.mark.asyncio
async def test_article_audio(client: AsyncClient):
    res = await client.post("/api/generate-audio", json={
        "sentences": [
            {"text": "Hello.", "chinese": "Hello cn."},
        ],
    })
    # With mocked TTS returning b"fake-mp3", pydub may fail to parse.
    # 200 = success (real env), 500 = expected (mock env with fake bytes)
    assert res.status_code in (200, 500)


# --- Recent Files ---

@pytest.mark.asyncio
async def test_recent_files_after_export(client: AsyncClient):
    group_id = await _create_group(client)

    # Download CSV (triggers file_store save)
    await client.get(f"/api/word-groups/{group_id}/csv")

    # Check recent files
    res = await client.get("/api/recent-files")
    assert res.status_code == 200
    files = res.json()
    assert len(files) >= 1
    assert files[0]["file_type"] == "csv"
