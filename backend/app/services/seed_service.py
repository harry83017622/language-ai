"""Seed JLPT vocabulary into the database for a given user."""

import json
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Word, WordGroup

SEED_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "seed_data")
LEVELS = ["n5", "n4", "n3"]
GROUP_SIZE = 25  # words per group


def _load_level(level: str) -> list[dict]:
    path = os.path.join(SEED_DIR, f"{level}.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


async def get_seed_status(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Return which JLPT levels have already been imported for this user."""
    result = await db.execute(
        select(WordGroup.title)
        .where(WordGroup.user_id == user_id, WordGroup.title.like("JLPT %"))
    )
    existing_titles = {r[0] for r in result.all()}

    status = {}
    for level in LEVELS:
        words = _load_level(level)
        total_words = len(words)
        total_groups = (total_words + GROUP_SIZE - 1) // GROUP_SIZE if total_words else 0
        imported_groups = sum(
            1 for i in range(total_groups)
            if f"JLPT {level.upper()} ({i + 1})" in existing_titles
        )
        status[level] = {
            "total_words": total_words,
            "total_groups": total_groups,
            "imported_groups": imported_groups,
            "fully_imported": imported_groups >= total_groups,
        }
    return status


async def import_level(
    db: AsyncSession, user_id: uuid.UUID, level: str
) -> dict:
    """Import a JLPT level's vocabulary for the user, skipping existing groups."""
    level = level.lower()
    if level not in LEVELS:
        raise ValueError(f"Invalid level: {level}. Must be one of {LEVELS}")

    words = _load_level(level)
    if not words:
        return {"imported_groups": 0, "imported_words": 0, "skipped_groups": 0}

    # Check existing groups
    result = await db.execute(
        select(WordGroup.title)
        .where(WordGroup.user_id == user_id, WordGroup.title.like(f"JLPT {level.upper()}%"))
    )
    existing_titles = {r[0] for r in result.all()}

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    imported_groups = 0
    imported_words = 0
    skipped_groups = 0

    # Split into groups of GROUP_SIZE
    for i in range(0, len(words), GROUP_SIZE):
        group_num = i // GROUP_SIZE + 1
        title = f"JLPT {level.upper()} ({group_num})"

        if title in existing_titles:
            skipped_groups += 1
            continue

        chunk = words[i:i + GROUP_SIZE]
        group = WordGroup(
            title=title,
            saved_date=today,
            user_id=user_id,
        )
        db.add(group)
        await db.flush()

        for j, w in enumerate(chunk):
            db.add(Word(
                group_id=group.id,
                term=w["term"],
                definition=w.get("definition"),
                reading=w.get("reading"),
                sort_order=j,
            ))
            imported_words += 1
        imported_groups += 1

    await db.commit()
    return {
        "imported_groups": imported_groups,
        "imported_words": imported_words,
        "skipped_groups": skipped_groups,
    }
