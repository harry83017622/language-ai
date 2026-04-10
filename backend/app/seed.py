"""Seed JLPT N3 vocabulary for a newly registered user."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Word, WordGroup
from app.seed_data import JLPT_N3_GROUPS


async def seed_default_words(db: AsyncSession, user_id) -> None:
    """Create JLPT N3 word groups for a user if they have none yet."""
    result = await db.execute(
        select(WordGroup.id).where(WordGroup.user_id == user_id).limit(1)
    )
    if result.scalar_one_or_none() is not None:
        return  # user already has data

    today = date.today().isoformat()

    for group_data in JLPT_N3_GROUPS:
        group = WordGroup(
            title=group_data["title"],
            saved_date=today,
            user_id=user_id,
        )
        db.add(group)
        await db.flush()

        for i, w in enumerate(group_data["words"]):
            db.add(Word(
                group_id=group.id,
                term=w["term"],
                definition=w.get("definition"),
                reading=w.get("reading"),
                mnemonic=w.get("mnemonic"),
                example_sentence=w.get("example_sentence"),
                sort_order=i,
            ))

    await db.commit()
