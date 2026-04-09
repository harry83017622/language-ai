from __future__ import annotations

import datetime
import uuid

from pydantic import BaseModel


class WordGenerateRequest(BaseModel):
    term: str
    need_definition: bool = True
    need_reading: bool = True
    need_example: bool = True
    need_mnemonic: bool = True


class GenerateRequest(BaseModel):
    words: list[WordGenerateRequest]
    force: bool = False


class WordGenerateResult(BaseModel):
    term: str
    definition: str | None = None
    reading: str | None = None
    example_sentence: str | None = None
    mnemonic_options: list[str] | None = None


class GenerateResponse(BaseModel):
    results: list[WordGenerateResult]


class WordCreate(BaseModel):
    term: str
    definition: str | None = None
    reading: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None
    sort_order: int = 0


class WordGroupCreate(BaseModel):
    title: str
    saved_date: str
    words: list[WordCreate]


class WordOut(BaseModel):
    id: uuid.UUID
    term: str
    definition: str | None = None
    reading: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None
    sort_order: int
    marked_for_review: bool = False

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
    term: str
    definition: str | None = None
    reading: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None
    sort_order: int
    group_title: str
    group_saved_date: str

    model_config = {"from_attributes": True}


class WordUpdate(BaseModel):
    term: str | None = None
    definition: str | None = None
    reading: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None
