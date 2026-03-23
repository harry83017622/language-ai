import csv
import io
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from pydantic import BaseModel as PydanticBaseModel
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
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
from app.services.llm_service import generate_words

router = APIRouter(prefix="/api", tags=["words"])

# Column detection keywords
_COLUMN_PATTERNS: dict[str, list[str]] = {
    "english": ["english", "eng", "英文", "單字", "word", "vocabulary", "vocab"],
    "chinese": ["chinese", "中文", "翻譯", "解釋", "meaning", "definition", "chi", "中文解釋"],
    "kk_phonetic": ["kk", "音標", "phonetic", "pronunciation", "發音"],
    "mnemonic": ["諧音", "記憶", "mnemonic", "memory", "聯想", "故事", "story"],
    "example_sentence": ["例句", "sentence", "example", "造句"],
}


def _detect_column(header: str) -> str | None:
    h = header.strip().lower()
    for field, keywords in _COLUMN_PATTERNS.items():
        for kw in keywords:
            if kw in h:
                return field
    return None


@router.post("/upload-csv")
async def upload_csv(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="請上傳 CSV 檔案")

    content = await file.read()
    # Try utf-8 first, fallback to big5 (common for Traditional Chinese CSVs)
    for encoding in ("utf-8-sig", "utf-8", "big5", "gbk"):
        try:
            text = content.decode(encoding)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    else:
        raise HTTPException(status_code=400, detail="無法解析檔案編碼")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV 沒有欄位標題")

    # Auto-detect column mapping
    col_map: dict[str, str] = {}  # csv_header -> our_field
    for header in reader.fieldnames:
        field = _detect_column(header)
        if field and field not in col_map.values():
            col_map[header] = field

    if "english" not in col_map.values():
        raise HTTPException(status_code=400, detail="找不到英文欄位，請確認 CSV 標題包含 english/英文/單字 等關鍵字")

    words = []
    for row in reader:
        word: dict[str, str | None] = {
            "english": None,
            "chinese": None,
            "kk_phonetic": None,
            "mnemonic": None,
            "example_sentence": None,
        }
        for csv_header, field in col_map.items():
            val = row.get(csv_header, "").strip()
            if val:
                word[field] = val
        if word["english"]:
            words.append(word)

    if not words:
        raise HTTPException(status_code=400, detail="CSV 中沒有有效的單字資料")

    # Look up existing words in DB for ALL fields
    english_list = [w["english"].lower() for w in words]
    result = await db.execute(
        select(Word)
        .join(WordGroup)
        .where(WordGroup.user_id == user.id, func.lower(Word.english).in_(english_list))
    )
    existing: dict[str, Word] = {}
    for row in result.scalars().all():
        key = row.english.lower()
        if key not in existing:
            existing[key] = row

    # Fill missing fields from DB
    for w in words:
        db_word = existing.get(w["english"].lower())
        if db_word:
            if not w["chinese"] and db_word.chinese:
                w["chinese"] = db_word.chinese
            if not w["kk_phonetic"] and db_word.kk_phonetic:
                w["kk_phonetic"] = db_word.kk_phonetic
            if not w["example_sentence"] and db_word.example_sentence:
                w["example_sentence"] = db_word.example_sentence
            if not w["mnemonic"] and db_word.mnemonic:
                w["mnemonic"] = db_word.mnemonic

    # For words still missing fields, call LLM (phrases skip mnemonic)
    words_for_llm = [
        w for w in words
        if not w["mnemonic"] or not w["chinese"] or not w["kk_phonetic"] or not w["example_sentence"]
    ]
    mnemonic_options_map: dict[str, list[str]] = {}

    if words_for_llm:
        llm_request = GenerateRequest(
            words=[
                WordGenerateRequest(
                    english=w["english"],
                    need_chinese=not w["chinese"],
                    need_kk=not w["kk_phonetic"],
                    need_example=not w["example_sentence"],
                    need_mnemonic=not w["mnemonic"] and " " not in w["english"].strip(),
                )
                for w in words_for_llm
            ]
        )
        llm_results = await generate_words(llm_request)
        for w, lr in zip(words_for_llm, llm_results):
            if not w["chinese"] and lr.chinese:
                w["chinese"] = lr.chinese
            if not w["kk_phonetic"] and lr.kk_phonetic:
                w["kk_phonetic"] = lr.kk_phonetic
            if not w["example_sentence"] and lr.example_sentence:
                w["example_sentence"] = lr.example_sentence
            if lr.mnemonic_options:
                mnemonic_options_map[w["english"].lower()] = lr.mnemonic_options

    # Build response with mnemonic_options
    response_words = []
    for w in words:
        entry = {**w}
        key = w["english"].lower()
        if key in mnemonic_options_map:
            entry["mnemonic_options"] = mnemonic_options_map[key]
        elif w["mnemonic"]:
            entry["mnemonic_options"] = [w["mnemonic"]]
        response_words.append(entry)

    return {
        "words": response_words,
        "detected_columns": {v: k for k, v in col_map.items()},
    }


@router.get("/search-words", response_model=list[WordSearchResult])
async def search_words(
    q: str = Query(..., min_length=4),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Word, WordGroup.title, WordGroup.saved_date)
        .join(WordGroup)
        .where(WordGroup.user_id == user.id, Word.english.ilike(f"%{q}%"))
        .order_by(Word.english)
    )
    rows = result.all()
    return [
        WordSearchResult(
            id=word.id,
            english=word.english,
            chinese=word.chinese,
            kk_phonetic=word.kk_phonetic,
            mnemonic=word.mnemonic,
            example_sentence=word.example_sentence,
            sort_order=word.sort_order,
            group_title=title,
            group_saved_date=saved_date,
        )
        for word, title, saved_date in rows
    ]


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


@router.get("/word-groups/{group_id}/pdf")
async def export_word_group_pdf(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from urllib.parse import quote

    from fpdf import FPDF

    result = await db.execute(
        select(WordGroup)
        .options(selectinload(WordGroup.words))
        .where(WordGroup.id == group_id, WordGroup.user_id == user.id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Word group not found")

    font_path = "/app/fonts/NotoSansTC-Regular.otf"
    if not os.path.exists(font_path):
        raise HTTPException(status_code=500, detail="CJK font not found")

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.add_font("NotoSans", "", font_path, uni=True)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Title
    pdf.set_font("NotoSans", size=16)
    pdf.cell(0, 10, f"{group.title} ({group.saved_date})", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Table header
    col_widths = [40, 35, 45, 50, 107]
    headers = ["英文", "中文", "KK 音標", "故事", "例句"]
    pdf.set_font("NotoSans", size=10)
    pdf.set_fill_color(24, 144, 255)
    pdf.set_text_color(255, 255, 255)
    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], 8, h, border=1, fill=True, align="C")
    pdf.ln()

    # Table rows
    pdf.set_font("NotoSans", size=9)
    pdf.set_text_color(0, 0, 0)
    for row_idx, w in enumerate(group.words):
        if row_idx % 2 == 1:
            pdf.set_fill_color(245, 245, 245)
        else:
            pdf.set_fill_color(255, 255, 255)

        cells = [
            w.english,
            w.chinese or "",
            w.kk_phonetic or "",
            w.mnemonic or "",
            w.example_sentence or "",
        ]

        # Calculate row height based on longest cell
        max_lines = 1
        for i, cell in enumerate(cells):
            cell_width = col_widths[i] - 2
            text_width = pdf.get_string_width(cell)
            lines = max(1, int(text_width / cell_width) + 1)
            max_lines = max(max_lines, lines)
        row_height = max(7, max_lines * 5)

        x_start = pdf.get_x()
        y_start = pdf.get_y()

        # Check if we need a new page
        if y_start + row_height > pdf.h - 15:
            pdf.add_page()
            y_start = pdf.get_y()

        for i, cell in enumerate(cells):
            pdf.set_xy(x_start + sum(col_widths[:i]), y_start)
            pdf.multi_cell(col_widths[i], row_height / max_lines, cell, border=1, fill=True)

        pdf.set_xy(x_start, y_start + row_height)

    buffer = io.BytesIO(pdf.output())
    filename = f"{group.title}_{group.saved_date}.pdf"
    encoded = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"},
    )


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
        select(Word)
        .join(WordGroup)
        .where(Word.id.in_(payload.word_ids), WordGroup.user_id == user.id)
    )
    words = result.scalars().all()
    for w in words:
        w.marked_for_review = payload.marked
    await db.commit()
    return {"ok": True, "updated": len(words)}


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


