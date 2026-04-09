from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class Sentence(BaseModel):
    speaker: str | None = None
    text: str
    definition: str | None = None


class GenerateArticleRequest(BaseModel):
    words: list[str]
    mode: str = "article"
    ratio: float = 0.9


class GenerateArticleResponse(BaseModel):
    title: str
    sentences: list[Sentence]
    used_words: list[str]


class AudioVideoRequest(BaseModel):
    sentences: list[Sentence]


class ArticlePdfRequest(BaseModel):
    title: str
    sentences: list[Sentence]
    used_words: list[str] = []


class SaveArticleRequest(BaseModel):
    title: str
    input_words: list[str]
    mode: str
    ratio: float
    sentences: list[Sentence]
    used_words: list[str]


class ArticleOut(BaseModel):
    id: uuid.UUID
    title: str
    input_words: list[str]
    mode: str
    ratio: float
    sentences: list[Sentence]
    used_words: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ArticleSummary(BaseModel):
    id: uuid.UUID
    title: str
    mode: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewWord(BaseModel):
    term: str
    definition: str | None = None
    reading: str | None = None
    mnemonic: str | None = None


class ReviewVideoRequest(BaseModel):
    words: list[ReviewWord]
