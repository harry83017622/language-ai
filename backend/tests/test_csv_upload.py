"""Tests for CSV upload and parsing."""

import io
import json
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient


def _make_csv(content: str) -> bytes:
    return content.encode("utf-8-sig")


@pytest.fixture
def mock_csv_llm(mock_openai):
    """Configure LLM mock for CSV upload (generates missing fields)."""
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.content = json.dumps({"results": [
        {
            "english": "apple",
            "chinese": "蘋果",
            "kk_phonetic": "[ˈæpəl]",
            "example_sentence": "I eat an apple every day.",
            "mnemonic_options": ["阿婆", "哎呀剝", "愛泡"],
        },
    ]})
    mock_openai.chat.completions.create.return_value = response
    return mock_openai


@pytest.mark.asyncio
async def test_upload_csv_basic(client: AsyncClient, mock_csv_llm):
    csv_content = _make_csv("english,中文\napple,蘋果\nbanana,香蕉\n")
    files = {"file": ("test.csv", io.BytesIO(csv_content), "text/csv")}
    res = await client.post("/api/upload-csv", files=files)
    assert res.status_code == 200
    data = res.json()
    assert len(data["words"]) == 2
    assert data["words"][0]["english"] == "apple"
    assert data["words"][0]["chinese"] == "蘋果"


@pytest.mark.asyncio
async def test_upload_csv_auto_detect_columns(client: AsyncClient, mock_csv_llm):
    csv_content = _make_csv("單字,中文解釋,KK音標\ncat,貓,[kæt]\ndog,狗,[dɔɡ]\n")
    files = {"file": ("vocab.csv", io.BytesIO(csv_content), "text/csv")}
    res = await client.post("/api/upload-csv", files=files)
    assert res.status_code == 200
    data = res.json()
    detected = data["detected_columns"]
    assert "english" in detected
    assert "chinese" in detected
    assert "kk_phonetic" in detected


@pytest.mark.asyncio
async def test_upload_csv_fills_from_db(client: AsyncClient, mock_csv_llm):
    # First create a word in DB
    await client.post("/api/word-groups", json={
        "title": "Existing",
        "saved_date": "2026-04-04",
        "words": [{"english": "apple", "chinese": "蘋果", "mnemonic": "阿婆"}],
    })

    # Upload CSV with same word, missing chinese
    csv_content = _make_csv("english\napple\n")
    files = {"file": ("test.csv", io.BytesIO(csv_content), "text/csv")}
    res = await client.post("/api/upload-csv", files=files)
    assert res.status_code == 200
    word = res.json()["words"][0]
    assert word["chinese"] == "蘋果"  # Filled from DB
    assert word["mnemonic"] == "阿婆"  # Filled from DB


@pytest.mark.asyncio
async def test_upload_csv_rejects_non_csv(client: AsyncClient):
    files = {"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")}
    res = await client.post("/api/upload-csv", files=files)
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_upload_csv_rejects_no_english_column(client: AsyncClient):
    csv_content = _make_csv("中文,備註\n蘋果,好吃\n")
    files = {"file": ("test.csv", io.BytesIO(csv_content), "text/csv")}
    res = await client.post("/api/upload-csv", files=files)
    assert res.status_code == 400
    assert "英文欄位" in res.json()["detail"]
