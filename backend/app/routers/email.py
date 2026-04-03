import os
import smtplib
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Article, GeneratedFile, User, WordGroup
from app.services.file_store import list_recent_files

router = APIRouter(prefix="/api", tags=["email"])

SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD")


class FileOut(BaseModel):
    id: str
    filename: str
    file_type: str
    created_at: str

    model_config = {"from_attributes": True}


class SendEmailRequest(BaseModel):
    to: str
    subject: str = ""
    group_ids: list[str] = []
    article_ids: list[str] = []
    file_ids: list[str] = []
    custom_text: str = ""


@router.get("/recent-files", response_model=list[FileOut])
async def get_recent_files(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    files = await list_recent_files(db, user.id)
    return [FileOut(id=str(f.id), filename=f.filename, file_type=f.file_type, created_at=str(f.created_at)) for f in files]


@router.post("/send-email")
async def send_email(
    payload: SendEmailRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        raise HTTPException(status_code=500, detail="SMTP 未設定")

    if not payload.group_ids and not payload.article_ids and not payload.file_ids and not payload.custom_text:
        raise HTTPException(status_code=400, detail="請選擇至少一項內容")

    html_parts = ['<html><body style="font-family:sans-serif;">']
    text_parts = []

    # --- Word Groups ---
    if payload.group_ids:
        result = await db.execute(
            select(WordGroup)
            .options(selectinload(WordGroup.words))
            .where(WordGroup.user_id == user.id, WordGroup.id.in_(payload.group_ids))
            .order_by(WordGroup.saved_date.desc())
        )
        groups = result.scalars().all()

        for g in groups:
            html_parts.append(f"<h3>{g.title} ({g.saved_date})</h3>")
            html_parts.append(
                '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;">'
            )
            html_parts.append(
                "<tr style='background:#1890ff;color:#fff;'>"
                "<th>英文</th><th>中文</th><th>KK 音標</th><th>故事</th><th>例句</th>"
                "</tr>"
            )
            for w in g.words:
                html_parts.append(
                    f"<tr>"
                    f"<td>{w.english}</td>"
                    f"<td>{w.chinese or ''}</td>"
                    f"<td>{w.kk_phonetic or ''}</td>"
                    f"<td>{w.mnemonic or ''}</td>"
                    f"<td>{w.example_sentence or ''}</td>"
                    f"</tr>"
                )
            html_parts.append("</table><br/>")

            text_parts.append(f"\n{g.title} ({g.saved_date})")
            text_parts.append("-" * 40)
            for w in g.words:
                text_parts.append(
                    f"{w.english} | {w.chinese or ''} | {w.kk_phonetic or ''} | {w.mnemonic or ''} | {w.example_sentence or ''}"
                )

    # --- Articles ---
    if payload.article_ids:
        result = await db.execute(
            select(Article)
            .where(Article.user_id == user.id, Article.id.in_(payload.article_ids))
            .order_by(Article.created_at.desc())
        )
        articles = result.scalars().all()

        for a in articles:
            mode_label = "文章" if a.mode == "article" else "對話"
            html_parts.append(f"<h3>{a.title} ({mode_label})</h3>")
            for s in a.sentences:
                speaker = s.get("speaker")
                text = s.get("text", "")
                chinese = s.get("chinese", "")
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
            html_parts.append("<br/>")
            text_parts.append("")

    # --- Custom Text ---
    if payload.custom_text:
        html_parts.append(f"<div style='white-space:pre-wrap;'>{payload.custom_text}</div>")
        text_parts.append(payload.custom_text)

    html_parts.append("</body></html>")

    # Fetch file attachments
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

    # Build email
    subject = payload.subject.strip() if payload.subject.strip() else "English Vocab Tool"

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = SMTP_EMAIL
    recipients = [r.strip() for r in payload.to.split(",") if r.strip()]
    if not recipients:
        raise HTTPException(status_code=400, detail="請輸入收件人")
    msg["To"] = ", ".join(recipients)

    # Body (alternative: plain + html)
    body = MIMEMultipart("alternative")
    body.attach(MIMEText("\n".join(text_parts), "plain", "utf-8"))
    body.attach(MIMEText("\n".join(html_parts), "html", "utf-8"))
    msg.attach(body)

    # Attachments
    for fname, fdata in attachments:
        part = MIMEBase("application", "octet-stream")
        part.set_payload(fdata)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f"attachment; filename={fname}")
        msg.attach(part)

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
            server.send_message(msg, to_addrs=recipients)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"發信失敗：{str(e)}")

    return {"ok": True, "sent_to": recipients}
