import random
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import ReviewLog, User, Word, WordGroup

router = APIRouter(prefix="/api/review", tags=["review"])


# --- Schemas ---

class ReviewWordOut(BaseModel):
    id: uuid.UUID
    english: str
    chinese: str | None = None
    kk_phonetic: str | None = None
    mnemonic: str | None = None
    example_sentence: str | None = None

    model_config = {"from_attributes": True}


class LogReviewRequest(BaseModel):
    word_id: uuid.UUID
    result: str  # "remember", "unsure", "forget"


class ForgottenWord(BaseModel):
    english: str
    chinese: str | None = None
    count: int


class ReviewWordStat(BaseModel):
    english: str
    chinese: str | None = None
    kk_phonetic: str | None = None
    mnemonic: str | None = None
    count: int


class TimePeriodStats(BaseModel):
    today: list[ReviewWordStat]
    week: list[ReviewWordStat]
    month: list[ReviewWordStat]
    quarter: list[ReviewWordStat]
    all: list[ReviewWordStat]


class WeeklyStat(BaseModel):
    week_start: str  # "2026-03-17"
    week_end: str    # "2026-03-23"
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


# --- Weighted word selection ---

WEIGHT_NEW = 5
WEIGHT_FORGET = 8
WEIGHT_UNSURE = 4
WEIGHT_REMEMBER = 1


@router.get("/words", response_model=list[ReviewWordOut])
async def get_review_words(
    source: str = Query("all"),  # "all" or "marked"
    count: int = Query(20),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get eligible words (< 4 English words, i.e. not long sentences)
    stmt = (
        select(Word)
        .join(WordGroup)
        .where(WordGroup.user_id == user.id)
    )
    if source == "marked":
        stmt = stmt.where(Word.marked_for_review == True)

    result = await db.execute(stmt)
    all_words = result.scalars().all()

    # Filter: only words/phrases with < 4 space-separated tokens
    eligible = [w for w in all_words if len(w.english.strip().split()) < 4]
    if not eligible:
        return []

    # Get latest review log per word for this user
    log_stmt = (
        select(
            ReviewLog.word_id,
            ReviewLog.result,
            func.max(ReviewLog.created_at).label("last_reviewed"),
        )
        .where(ReviewLog.user_id == user.id)
        .group_by(ReviewLog.word_id, ReviewLog.result)
    )
    log_result = await db.execute(log_stmt)
    log_rows = log_result.all()

    # Build latest result per word
    latest_per_word: dict[uuid.UUID, tuple[str, datetime]] = {}
    for row in log_rows:
        wid = row.word_id
        if wid not in latest_per_word or row.last_reviewed > latest_per_word[wid][1]:
            latest_per_word[wid] = (row.result, row.last_reviewed)

    # Calculate weights
    now = datetime.now(timezone.utc)
    weighted: list[tuple[Word, float]] = []
    for w in eligible:
        if w.id in latest_per_word:
            last_result, last_time = latest_per_word[w.id]
            days_since = max(1, (now - last_time).days)
            if last_result == "forget":
                base = WEIGHT_FORGET
            elif last_result == "unsure":
                base = WEIGHT_UNSURE
            else:
                base = WEIGHT_REMEMBER
            weight = base + min(days_since * 0.5, 10)  # cap day bonus at 10
        else:
            weight = WEIGHT_NEW
        weighted.append((w, weight))

    # Weighted random sampling
    pick_count = min(count, len(weighted))
    words_only = [item[0] for item in weighted]
    weights_only = [item[1] for item in weighted]
    selected = random.choices(words_only, weights=weights_only, k=pick_count)

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for w in selected:
        if w.id not in seen:
            seen.add(w.id)
            unique.append(w)

    # If dedup reduced count, fill from remaining
    remaining = [w for w, _ in weighted if w.id not in seen]
    random.shuffle(remaining)
    while len(unique) < pick_count and remaining:
        unique.append(remaining.pop())

    return unique


@router.post("/log")
async def log_review(
    payload: LogReviewRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    log = ReviewLog(
        word_id=payload.word_id,
        user_id=user.id,
        result=payload.result,
    )
    db.add(log)
    await db.commit()
    return {"ok": True}


async def _top_by_result(db: AsyncSession, user_id: uuid.UUID, result: str, since: datetime | None) -> list[ReviewWordStat]:
    stmt = (
        select(Word.english, Word.chinese, Word.kk_phonetic, Word.mnemonic, func.count().label("cnt"))
        .join(ReviewLog, ReviewLog.word_id == Word.id)
        .where(ReviewLog.user_id == user_id, ReviewLog.result == result)
    )
    if since:
        stmt = stmt.where(ReviewLog.created_at >= since)
    stmt = stmt.group_by(Word.english, Word.chinese, Word.kk_phonetic, Word.mnemonic).order_by(func.count().desc())
    res = await db.execute(stmt)
    return [ReviewWordStat(english=r.english, chinese=r.chinese, kk_phonetic=r.kk_phonetic, mnemonic=r.mnemonic, count=r.cnt) for r in res.all()]


async def _period_stats(db: AsyncSession, user_id: uuid.UUID, result: str) -> TimePeriodStats:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return TimePeriodStats(
        today=await _top_by_result(db, user_id, result, today_start),
        week=await _top_by_result(db, user_id, result, now - timedelta(days=7)),
        month=await _top_by_result(db, user_id, result, now - timedelta(days=30)),
        quarter=await _top_by_result(db, user_id, result, now - timedelta(days=90)),
        all=await _top_by_result(db, user_id, result, None),
    )


@router.get("/stats", response_model=ReviewStatsOut)
async def get_review_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count_stmt = (
        select(ReviewLog.result, func.count().label("cnt"))
        .where(ReviewLog.user_id == user.id)
        .group_by(ReviewLog.result)
    )
    count_result = await db.execute(count_stmt)
    counts = {r.result: r.cnt for r in count_result.all()}

    # Weekly trend (last 12 weeks)
    now = datetime.now(timezone.utc)
    weekly_trend: list[WeeklyStat] = []
    for i in range(11, -1, -1):
        week_end = now - timedelta(days=now.weekday()) - timedelta(weeks=i)
        week_start = week_end - timedelta(days=7)
        week_end_ts = week_end.replace(hour=23, minute=59, second=59)

        week_stmt = (
            select(ReviewLog.result, func.count().label("cnt"))
            .where(
                ReviewLog.user_id == user.id,
                ReviewLog.created_at >= week_start,
                ReviewLog.created_at < week_end_ts,
            )
            .group_by(ReviewLog.result)
        )
        week_result = await db.execute(week_stmt)
        week_counts = {r.result: r.cnt for r in week_result.all()}
        r = week_counts.get("remember", 0)
        u = week_counts.get("unsure", 0)
        f = week_counts.get("forget", 0)
        if r + u + f > 0:
            weekly_trend.append(WeeklyStat(
                week_start=week_start.strftime("%Y-%m-%d"),
                week_end=(week_end - timedelta(days=1)).strftime("%Y-%m-%d"),
                remember=r, unsure=u, forget=f, total=r + u + f,
            ))

    return ReviewStatsOut(
        total_reviews=sum(counts.values()),
        remember_count=counts.get("remember", 0),
        unsure_count=counts.get("unsure", 0),
        forget_count=counts.get("forget", 0),
        remember_words=await _period_stats(db, user.id, "remember"),
        unsure_words=await _period_stats(db, user.id, "unsure"),
        forget_words=await _period_stats(db, user.id, "forget"),
        weekly_trend=weekly_trend,
    )
