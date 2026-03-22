import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import User, Word, WordGroup
from app.schemas import (
    WordGroupCreate,
    WordGroupOut,
    WordGroupSummary,
    WordOut,
    WordUpdate,
)

router = APIRouter(prefix="/api", tags=["words"])


@router.post("/word-groups", response_model=WordGroupOut)
async def create_word_group(
    payload: WordGroupCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = WordGroup(title=payload.title, saved_date=payload.saved_date, user_id=user.id)
    db.add(group)
    await db.flush()

    for i, w in enumerate(payload.words):
        word = Word(
            group_id=group.id,
            english=w.english,
            chinese=w.chinese,
            kk_phonetic=w.kk_phonetic,
            mnemonic=w.mnemonic,
            example_sentence=w.example_sentence,
            sort_order=w.sort_order if w.sort_order else i,
        )
        db.add(word)

    await db.commit()

    result = await db.execute(
        select(WordGroup).options(selectinload(WordGroup.words)).where(WordGroup.id == group.id)
    )
    group = result.scalar_one()
    return group


@router.get("/word-groups", response_model=list[WordGroupSummary])
async def list_word_groups(
    title: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            WordGroup.id,
            WordGroup.title,
            WordGroup.saved_date,
            WordGroup.created_at,
            func.count(Word.id).label("word_count"),
        )
        .outerjoin(Word)
        .where(WordGroup.user_id == user.id)
        .group_by(WordGroup.id)
        .order_by(WordGroup.saved_date.desc())
    )

    if title:
        stmt = stmt.where(WordGroup.title.ilike(f"%{title}%"))
    if date_from:
        stmt = stmt.where(WordGroup.saved_date >= date_from)
    if date_to:
        stmt = stmt.where(WordGroup.saved_date <= date_to)

    result = await db.execute(stmt)
    rows = result.all()
    return [
        WordGroupSummary(
            id=r.id, title=r.title, saved_date=r.saved_date,
            created_at=r.created_at, word_count=r.word_count,
        )
        for r in rows
    ]


@router.get("/word-groups/{group_id}", response_model=WordGroupOut)
async def get_word_group(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WordGroup)
        .options(selectinload(WordGroup.words))
        .where(WordGroup.id == group_id, WordGroup.user_id == user.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Word group not found")
    return group


@router.put("/words/{word_id}", response_model=WordOut)
async def update_word(
    word_id: uuid.UUID,
    payload: WordUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Word).join(WordGroup).where(Word.id == word_id, WordGroup.user_id == user.id)
    )
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(word, key, value)

    await db.commit()
    await db.refresh(word)
    return word


@router.delete("/word-groups/{group_id}")
async def delete_word_group(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WordGroup).where(WordGroup.id == group_id, WordGroup.user_id == user.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Word group not found")
    await db.delete(group)
    await db.commit()
    return {"ok": True}
