"""Email sending endpoint with file attachments."""

import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Article, GeneratedFile, User, WordGroup
from app.schemas import FileOut, SendEmailRequest
from app.services import email_service
from app.services.file_store import list_recent_files

router = APIRouter(prefix="/api", tags=["email"])


# --- Endpoints ---

@router.get("/recent-files", response_model=list[FileOut])
async def get_recent_files(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    files = await list_recent_files(db, user.id)
    return [
        FileOut(id=str(f.id), filename=f.filename, file_type=f.file_type, created_at=str(f.created_at))
        for f in files
    ]


@router.post("/send-email")
async def send_email(
    payload: SendEmailRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not email_service.is_configured():
        raise HTTPException(status_code=500, detail="SMTP 未設定")

    recipients = [r.strip() for r in payload.to.split(",") if r.strip()]
    if not recipients:
        raise HTTPException(status_code=400, detail="請輸入收件人")

    if not payload.group_ids and not payload.article_ids and not payload.file_ids and not payload.custom_text:
        raise HTTPException(status_code=400, detail="請選擇至少一項內容")

    html_parts = ['<html><body style="font-family:sans-serif;">']
    text_parts = []

    # Word Groups
    if payload.group_ids:
        result = await db.execute(
            select(WordGroup).options(selectinload(WordGroup.words))
            .where(WordGroup.user_id == user.id, WordGroup.id.in_(payload.group_ids))
            .order_by(WordGroup.saved_date.desc())
        )
        for g in result.scalars().all():
            html_parts.append(f"<h3>{g.title} ({g.saved_date})</h3>")
            html_parts.append(
                '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;">'
                "<tr style='background:#1890ff;color:#fff;'>"
                "<th>日文</th><th>中文</th><th>讀音</th><th>記憶法</th><th>例句</th></tr>"
            )
            for w in g.words:
                html_parts.append(
                    f"<tr><td>{w.term}</td><td>{w.definition or ''}</td>"
                    f"<td>{w.reading or ''}</td><td>{w.mnemonic or ''}</td>"
                    f"<td>{w.example_sentence or ''}</td></tr>"
                )
            html_parts.append("</table><br/>")
            text_parts.append(f"\n{g.title} ({g.saved_date})")
            text_parts.append("-" * 40)
            for w in g.words:
                text_parts.append(
                    f"{w.term} | {w.definition or ''} | {w.reading or ''} | "
                    f"{w.mnemonic or ''} | {w.example_sentence or ''}"
                )

    # Articles
    if payload.article_ids:
        result = await db.execute(
            select(Article)
            .where(Article.user_id == user.id, Article.id.in_(payload.article_ids))
            .order_by(Article.created_at.desc())
        )
        for a in result.scalars().all():
            mode_label = "文章" if a.mode == "article" else "對話"
            html_parts.append(f"<h3>{a.title} ({mode_label})</h3>")
            for s in a.sentences:
                speaker = s.get("speaker")
                text = s.get("text", "")
                chinese = s.get("definition", "")
                if speaker:
                    html_parts.append(f"<p><b style='color:#1890ff;'>{speaker}:</b> {text}</p>")
                else:
                    html_parts.append(f"<p>{text}</p>")
                if chinese:
                    html_parts.append(f"<p style='color:#888;font-size:13px;margin-top:-8px;'>{chinese}</p>")
                prefix = f"{speaker}: " if speaker else ""
                text_parts.append(f"{prefix}{text}")
                if chinese:
                    text_parts.append(f"   {chinese}")
            text_parts.append("")

    # Custom text
    if payload.custom_text:
        html_parts.append(f"<div style='white-space:pre-wrap;'>{payload.custom_text}</div>")
        text_parts.append(payload.custom_text)

    html_parts.append("</body></html>")

    # File attachments
    attachments: list[tuple[str, bytes]] = []
    if payload.file_ids:
        file_result = await db.execute(
            select(GeneratedFile)
            .where(GeneratedFile.user_id == user.id, GeneratedFile.id.in_(payload.file_ids))
        )
        for f in file_result.scalars().all():
            if os.path.exists(f.file_path):
                with open(f.file_path, "rb") as fh:
                    attachments.append((f.filename, fh.read()))

    subject = payload.subject.strip() or "日文單字工具"

    try:
        email_service.send(
            to=recipients,
            subject=subject,
            html_body="\n".join(html_parts),
            text_body="\n".join(text_parts),
            attachments=attachments or None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"發信失敗：{str(e)}")

    return {"ok": True, "sent_to": recipients}
