from __future__ import annotations

import uuid

from pydantic import BaseModel


class ReviewWordOut(BaseModel):
    id: uuid.UUID
    term: str
    definition: str | None = None
    reading: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None

    model_config = {"from_attributes": True}


class LogReviewRequest(BaseModel):
    word_id: uuid.UUID
    result: str  # "remember", "unsure", "forget"


class ReviewWordStat(BaseModel):
    term: str
    definition: str | None = None
    reading: str | None = None
    mnemonic: str | None = None
    count: int


class TimePeriodStats(BaseModel):
    today: list[ReviewWordStat]
    week: list[ReviewWordStat]
    month: list[ReviewWordStat]
    quarter: list[ReviewWordStat]
    all: list[ReviewWordStat]


class WeeklyStat(BaseModel):
    week_start: str
    week_end: str
    remember: int
    unsure: int
    forget: int
    total: int


class ReviewStatsOut(BaseModel):
    total_reviews: int
    remember_count: int
    unsure_count: int
    forget_count: int
    remember_words: TimePeriodStats
    unsure_words: TimePeriodStats
    forget_words: TimePeriodStats
    weekly_trend: list[WeeklyStat]


class ExportWordOut(BaseModel):
    term: str
    definition: str | None = None
    reading: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None
    count: int
