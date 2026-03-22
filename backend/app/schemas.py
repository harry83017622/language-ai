from __future__ import annotations

import datetime
import uuid

from pydantic import BaseModel


# --- Auth ---

class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    picture: str | None = None

    model_config = {"from_attributes": True}


# --- LLM Generation ---

class WordGenerateRequest(BaseModel):
    english: str
    need_chinese: bool = True
    need_kk: bool = True
    need_example: bool = True
    need_mnemonic: bool = True


class GenerateRequest(BaseModel):
    words: list[WordGenerateRequest]


class WordGenerateResult(BaseModel):
    english: str
    chinese: str | None = None
    kk_phonetic: str | None = None
    example_sentence: str | None = None
    mnemonic: str | None = None


class GenerateResponse(BaseModel):
    results: list[WordGenerateResult]


# --- CRUD ---

class WordCreate(BaseModel):
    english: str
    chinese: str | None = None
    kk_phonetic: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None
    sort_order: int = 0


class WordGroupCreate(BaseModel):
    title: str
    saved_date: str  # e.g. "2026-03-22"
    words: list[WordCreate]


class WordOut(BaseModel):
    id: uuid.UUID
    english: str
    chinese: str | None = None
    kk_phonetic: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None
    sort_order: int

    model_config = {"from_attributes": True}


class WordGroupOut(BaseModel):
    id: uuid.UUID
    title: str
    saved_date: str
    created_at: datetime.datetime
    words: list[WordOut]

    model_config = {"from_attributes": True}


class WordGroupSummary(BaseModel):
    id: uuid.UUID
    title: str
    saved_date: str
    created_at: datetime.datetime
    word_count: int

    model_config = {"from_attributes": True}


class WordSearchResult(BaseModel):
    id: uuid.UUID
    english: str
    chinese: str | None = None
    kk_phonetic: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None
    sort_order: int
    group_title: str
    group_saved_date: str

    model_config = {"from_attributes": True}


class WordUpdate(BaseModel):
    english: str | None = None
    chinese: str | None = None
    kk_phonetic: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None
