"""Review business logic — weighted selection, statistics, time periods."""

import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ReviewLog, Word, WordGroup

# Weight constants for word selection
WEIGHT_NEW = 5
WEIGHT_FORGET = 8
WEIGHT_UNSURE = 4
WEIGHT_REMEMBER = 1

# Label mappings
TYPE_LABELS = {"forget": "忘記", "unsure": "不確定", "remember": "記得"}
PERIOD_LABELS = {"today": "本日", "week": "本週", "month": "本月", "quarter": "本季", "all": "全部"}
FIELD_LABELS = {
    "term": "日文", "definition": "中文", "reading": "讀音",
    "mnemonic": "記憶法", "example_sentence": "例句",
}


def get_since(period: str) -> datetime | None:
    """Convert a period string to a datetime threshold."""
    now = datetime.now(timezone.utc)
    mapping = {
        "today": now.replace(hour=0, minute=0, second=0, microsecond=0),
        "week": now - timedelta(days=7),
        "month": now - timedelta(days=30),
        "quarter": now - timedelta(days=90),
        "all": None,
    }
    return mapping.get(period)


async def get_weighted_words(
    db: AsyncSession,
    user_id: uuid.UUID,
    source: str,
    count: int,
) -> list[Word]:
    """Select words using weighted random sampling based on review history."""
    stmt = select(Word).join(WordGroup).where(WordGroup.user_id == user_id)
    if source == "marked":
        stmt = stmt.where(Word.marked_for_review == True)

    result = await db.execute(stmt)
    all_words = result.scalars().all()

    # Filter: only words with reasonable length
    eligible = [w for w in all_words if len(w.term.strip()) <= 20]
    if not eligible:
        return []

    # Get latest review per word
    log_stmt = (
        select(
            ReviewLog.word_id,
            ReviewLog.result,
            func.max(ReviewLog.created_at).label("last_reviewed"),
        )
        .where(ReviewLog.user_id == user_id)
        .group_by(ReviewLog.word_id, ReviewLog.result)
    )
    log_result = await db.execute(log_stmt)

    latest_per_word: dict[uuid.UUID, tuple[str, datetime]] = {}
    for row in log_result.all():
        wid = row.word_id
        if wid not in latest_per_word or row.last_reviewed > latest_per_word[wid][1]:
            latest_per_word[wid] = (row.result, row.last_reviewed)

    # Calculate weights
    now = datetime.now(timezone.utc)
    weighted: list[tuple[Word, float]] = []
    for w in eligible:
        if w.id in latest_per_word:
            last_result, last_time = latest_per_word[w.id]
            if last_time.tzinfo is None:
                last_time = last_time.replace(tzinfo=timezone.utc)
            days_since = max(1, (now - last_time).days)
            base = {
                "forget": WEIGHT_FORGET,
                "unsure": WEIGHT_UNSURE,
            }.get(last_result, WEIGHT_REMEMBER)
            weight = base + min(days_since * 0.5, 10)
        else:
            weight = WEIGHT_NEW
        weighted.append((w, weight))

    # Weighted random sampling + dedup
    pick_count = min(count, len(weighted))
    words_only = [item[0] for item in weighted]
    weights_only = [item[1] for item in weighted]
    selected = random.choices(words_only, weights=weights_only, k=pick_count)

    seen = set()
    unique = []
    for w in selected:
        if w.id not in seen:
            seen.add(w.id)
            unique.append(w)

    remaining = [w for w, _ in weighted if w.id not in seen]
    random.shuffle(remaining)
    while len(unique) < pick_count and remaining:
        unique.append(remaining.pop())

    return unique


async def get_top_by_result(
    db: AsyncSession,
    user_id: uuid.UUID,
    result: str,
    since: datetime | None,
    limit: int | None = None,
) -> list[dict]:
    """Get top words by review result, optionally filtered by time."""
    stmt = (
        select(
            Word.term, Word.definition, Word.reading, Word.mnemonic,
            Word.example_sentence, func.count().label("cnt"),
        )
        .join(ReviewLog, ReviewLog.word_id == Word.id)
        .where(ReviewLog.user_id == user_id, ReviewLog.result == result)
    )
    if since:
        stmt = stmt.where(ReviewLog.created_at >= since)
    stmt = stmt.group_by(
        Word.term, Word.definition, Word.reading, Word.mnemonic, Word.example_sentence
    ).order_by(func.count().desc())
    if limit:
        stmt = stmt.limit(limit)
    res = await db.execute(stmt)
    return [
        {
            "term": r.term,
            "definition": r.definition,
            "reading": r.reading,
            "mnemonic": r.mnemonic,
            "example_sentence": r.example_sentence,
            "count": r.cnt,
        }
        for r in res.all()
    ]


async def get_period_stats(
    db: AsyncSession, user_id: uuid.UUID, result: str
) -> dict:
    """Get top words for all time periods."""
    now = datetime.now(timezone.utc)
    return {
        "today": await get_top_by_result(db, user_id, result, now.replace(hour=0, minute=0, second=0, microsecond=0)),
        "week": await get_top_by_result(db, user_id, result, now - timedelta(days=7)),
        "month": await get_top_by_result(db, user_id, result, now - timedelta(days=30)),
        "quarter": await get_top_by_result(db, user_id, result, now - timedelta(days=90)),
        "all": await get_top_by_result(db, user_id, result, None),
    }
