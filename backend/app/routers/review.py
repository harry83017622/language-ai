"""Review flashcard, statistics, and export endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import ReviewLog, User
from app.schemas import (
    LogReviewRequest, ReviewStatsOut, ReviewWordOut, WeeklyStat,
)
from app.services import review_service
from app.services.export_service import build_csv_response
from app.services.file_store import save_file
from app.services.pdf_service import build_review_export_pdf

router = APIRouter(prefix="/api/review", tags=["review"])


# --- Endpoints ---

@router.get("/words", response_model=list[ReviewWordOut])
async def get_review_words(
    source: str = Query("all"),
    count: int = Query(20),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    words = await review_service.get_weighted_words(db, user.id, source, count)
    return words


@router.post("/log")
async def log_review(
    payload: LogReviewRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    log = ReviewLog(word_id=payload.word_id, user_id=user.id, result=payload.result)
    db.add(log)
    await db.commit()
    return {"ok": True}


@router.get("/stats", response_model=ReviewStatsOut)
async def get_review_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Total counts
    count_stmt = (
        select(ReviewLog.result, func.count().label("cnt"))
        .where(ReviewLog.user_id == user.id)
        .group_by(ReviewLog.result)
    )
    count_result = await db.execute(count_stmt)
    counts = {r.result: r.cnt for r in count_result.all()}

    # Period stats for each result type
    remember_words = await review_service.get_period_stats(db, user.id, "remember")
    unsure_words = await review_service.get_period_stats(db, user.id, "unsure")
    forget_words = await review_service.get_period_stats(db, user.id, "forget")

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
        wc = {r.result: r.cnt for r in week_result.all()}
        r, u, f = wc.get("remember", 0), wc.get("unsure", 0), wc.get("forget", 0)
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
        remember_words=remember_words,
        unsure_words=unsure_words,
        forget_words=forget_words,
        weekly_trend=weekly_trend,
    )


# --- Export ---

@router.get("/export")
async def export_top_words(
    result_type: str = Query("forget"),
    period: str = Query("all"),
    limit: int = Query(10),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = review_service.get_since(period)
    return await review_service.get_top_by_result(db, user.id, result_type, since, limit)


@router.get("/export/csv")
async def export_top_words_csv(
    result_type: str = Query("forget"),
    period: str = Query("all"),
    limit: int = Query(10),
    fields: str = Query("term,definition,reading,mnemonic,example_sentence"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = review_service.get_since(period)
    rows = await review_service.get_top_by_result(db, user.id, result_type, since, limit)

    field_list = [f for f in fields.split(",") if f.strip()]
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    type_label = review_service.TYPE_LABELS.get(result_type, result_type)
    period_label = review_service.PERIOD_LABELS.get(period, period)

    title = f"{today_str} {type_label} Top {limit} ({period_label})"
    headers = [review_service.FIELD_LABELS.get(f, f) for f in field_list] + ["次數"]
    csv_rows = [[str(r.get(f, "") or "") for f in field_list] + [str(r.get("count", ""))] for r in rows]

    filename = f"{today_str}_{type_label}_Top{limit}_{period_label}.csv"
    response, csv_bytes = build_csv_response(headers, csv_rows, filename, title)
    await save_file(db, user.id, filename, "csv", csv_bytes)
    return response


@router.get("/export/pdf")
async def export_top_words_pdf(
    result_type: str = Query("forget"),
    period: str = Query("all"),
    limit: int = Query(10),
    fields: str = Query("term,definition,reading,mnemonic,example_sentence"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = review_service.get_since(period)
    rows = await review_service.get_top_by_result(db, user.id, result_type, since, limit)

    field_list = [f for f in fields.split(",") if f.strip()]
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    type_label = review_service.TYPE_LABELS.get(result_type, result_type)
    period_label = review_service.PERIOD_LABELS.get(period, period)

    title = f"{today_str} {type_label} Top {limit} ({period_label})"
    filename = f"{today_str}_{type_label}_Top{limit}_{period_label}.pdf"

    response, pdf_bytes = build_review_export_pdf(
        title, field_list, review_service.FIELD_LABELS, rows, filename
    )
    await save_file(db, user.id, filename, "pdf", pdf_bytes)
    return response
