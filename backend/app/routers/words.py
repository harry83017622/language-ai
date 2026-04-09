"""Word group CRUD, CSV upload/export, PDF export, search, and batch operations."""

import csv as csv_module
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.lang_config import COLUMN_PATTERNS
from app.models import User, Word, WordGroup
from app.schemas import (
    GenerateRequest,
    WordGenerateRequest,
    WordGroupCreate,
    WordGroupOut,
    WordGroupSummary,
    WordOut,
    WordSearchResult,
    WordUpdate,
)
from app.services.export_service import build_csv_response
from app.services.file_store import save_file
from app.services.llm_service import generate_words
from app.services.pdf_service import build_word_group_pdf

router = APIRouter(prefix="/api", tags=["words"])

# --- CSV Column Detection ---


def _detect_column(header: str) -> str | None:
    h = header.strip().lower()
    for field, keywords in COLUMN_PATTERNS.items():
        for kw in keywords:
            if kw in h:
                return field
    return None


# --- CSV Upload ---

@router.post("/upload-csv")
async def upload_csv(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="請上傳 CSV 檔案")

    content = await file.read()
    for encoding in ("utf-8-sig", "utf-8", "big5", "gbk"):
        try:
            text = content.decode(encoding)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    else:
        raise HTTPException(status_code=400, detail="無法解析檔案編碼")

    reader = csv_module.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV 沒有欄位標題")

    col_map: dict[str, str] = {}
    for header in reader.fieldnames:
        field = _detect_column(header)
        if field and field not in col_map.values():
            col_map[header] = field

    if "term" not in col_map.values():
        raise HTTPException(status_code=400, detail="找不到日文欄位")

    words = []
    for row in reader:
        word: dict[str, str | None] = {
            "term": None, "definition": None, "reading": None,
            "mnemonic": None, "example_sentence": None,
        }
        for csv_header, field in col_map.items():
            val = row.get(csv_header, "").strip()
            if val:
                word[field] = val
        if word["term"]:
            words.append(word)

    if not words:
        raise HTTPException(status_code=400, detail="CSV 中沒有有效的單字資料")

    # Look up existing words in DB
    term_list = [w["term"].lower() for w in words]
    result = await db.execute(
        select(Word).join(WordGroup)
        .where(WordGroup.user_id == user.id, func.lower(Word.term).in_(term_list))
    )
    existing: dict[str, Word] = {}
    for row in result.scalars().all():
        key = row.term.lower()
        if key not in existing:
            existing[key] = row

    # Fill from DB
    for w in words:
        db_word = existing.get(w["term"].lower())
        if db_word:
            for field in ("definition", "reading", "example_sentence", "mnemonic"):
                if not w[field] and getattr(db_word, field):
                    w[field] = getattr(db_word, field)

    # LLM for missing fields
    words_for_llm = [
        w for w in words
        if not w["mnemonic"] or not w["definition"] or not w["reading"] or not w["example_sentence"]
    ]
    mnemonic_options_map: dict[str, list[str]] = {}

    if words_for_llm:
        llm_request = GenerateRequest(
            words=[
                WordGenerateRequest(
                    term=w["term"],
                    need_definition=not w["definition"],
                    need_reading=not w["reading"],
                    need_example=not w["example_sentence"],
                    need_mnemonic=not w["mnemonic"],
                )
                for w in words_for_llm
            ]
        )
        llm_results = await generate_words(llm_request)
        for w, lr in zip(words_for_llm, llm_results):
            if not w["definition"] and lr.definition:
                w["definition"] = lr.definition
            if not w["reading"] and lr.reading:
                w["reading"] = lr.reading
            if not w["example_sentence"] and lr.example_sentence:
                w["example_sentence"] = lr.example_sentence
            if lr.mnemonic_options:
                mnemonic_options_map[w["term"].lower()] = lr.mnemonic_options

    response_words = []
    for w in words:
        entry = {**w}
        key = w["term"].lower()
        if key in mnemonic_options_map:
            entry["mnemonic_options"] = mnemonic_options_map[key]
        elif w["mnemonic"]:
            entry["mnemonic_options"] = [w["mnemonic"]]
        response_words.append(entry)

    return {
        "words": response_words,
        "detected_columns": {v: k for k, v in col_map.items()},
    }


# --- Search ---

@router.get("/search-words", response_model=list[WordSearchResult])
async def search_words(
    q: str = Query(..., min_length=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Word, WordGroup.title, WordGroup.saved_date)
        .join(WordGroup)
        .where(WordGroup.user_id == user.id, Word.term.ilike(f"%{q}%"))
        .order_by(Word.term)
    )
    return [
        WordSearchResult(
            id=word.id, term=word.term, definition=word.definition,
            reading=word.reading, mnemonic=word.mnemonic,
            example_sentence=word.example_sentence, sort_order=word.sort_order,
            group_title=title, group_saved_date=saved_date,
        )
        for word, title, saved_date in result.all()
    ]


# --- CRUD ---

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
        db.add(Word(
            group_id=group.id, term=w.term, definition=w.definition,
            reading=w.reading, mnemonic=w.mnemonic,
            example_sentence=w.example_sentence,
            sort_order=w.sort_order if w.sort_order else i,
        ))
    await db.commit()
    result = await db.execute(
        select(WordGroup).options(selectinload(WordGroup.words)).where(WordGroup.id == group.id)
    )
    return result.scalar_one()


@router.get("/word-groups", response_model=list[WordGroupSummary])
async def list_word_groups(
    title: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(WordGroup.id, WordGroup.title, WordGroup.saved_date, WordGroup.created_at,
               func.count(Word.id).label("word_count"))
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
    return [
        WordGroupSummary(id=r.id, title=r.title, saved_date=r.saved_date,
                         created_at=r.created_at, word_count=r.word_count)
        for r in result.all()
    ]


@router.get("/word-groups/{group_id}", response_model=WordGroupOut)
async def get_word_group(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WordGroup).options(selectinload(WordGroup.words))
        .where(WordGroup.id == group_id, WordGroup.user_id == user.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Word group not found")
    return group


# --- Export ---

@router.get("/word-groups/{group_id}/csv")
async def export_word_group_csv(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WordGroup).options(selectinload(WordGroup.words))
        .where(WordGroup.id == group_id, WordGroup.user_id == user.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Word group not found")

    headers = ["日文", "中文", "讀音", "記憶法", "例句"]
    rows = [
        [w.term, w.definition or "", w.reading or "", w.mnemonic or "", w.example_sentence or ""]
        for w in group.words
    ]
    filename = f"{group.title}_{group.saved_date}.csv"
    response, csv_bytes = build_csv_response(headers, rows, filename)
    await save_file(db, user.id, filename, "csv", csv_bytes)
    return response


@router.get("/word-groups/{group_id}/pdf")
async def export_word_group_pdf(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WordGroup).options(selectinload(WordGroup.words))
        .where(WordGroup.id == group_id, WordGroup.user_id == user.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Word group not found")

    words = [
        {"term": w.term, "definition": w.definition or "", "reading": w.reading or "",
         "mnemonic": w.mnemonic or "", "example_sentence": w.example_sentence or ""}
        for w in group.words
    ]
    response, pdf_bytes, filename = build_word_group_pdf(group.title, group.saved_date, words)
    await save_file(db, user.id, filename, "pdf", pdf_bytes)
    return response


# --- Batch Mark ---

class BatchMarkRequest(PydanticBaseModel):
    word_ids: list[uuid.UUID]
    marked: bool


@router.put("/words/batch-mark")
async def batch_mark_words(
    payload: BatchMarkRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Word).join(WordGroup)
        .where(Word.id.in_(payload.word_ids), WordGroup.user_id == user.id)
    )
    words = result.scalars().all()
    for w in words:
        w.marked_for_review = payload.marked
    await db.commit()
    return {"ok": True, "updated": len(words)}


# --- Update / Delete ---

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
    for key, value in payload.model_dump(exclude_unset=True).items():
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
