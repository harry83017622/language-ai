"""Article generation, audio/video export, and article CRUD."""

import io
import json
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Article, User
from app.schemas import (
    ArticleOut, ArticlePdfRequest, ArticleSummary, AudioVideoRequest,
    GenerateArticleRequest, GenerateArticleResponse, ReviewVideoRequest,
    SaveArticleRequest,
)
from app.services import audio_service, video_service
from app.services.file_store import save_file
from app.services.pdf_service import build_article_pdf

router = APIRouter(prefix="/api", tags=["article"])
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# --- Article Generation ---

ARTICLE_SYSTEM_PROMPT = """You are an English writing assistant for a Taiwanese student.
Generate a short English article or dialogue using the provided vocabulary words.
For each sentence, also provide a natural Traditional Chinese (繁體中文) translation.

Rules:
- Use approximately the specified ratio of the provided words (e.g., 90% means use ~90% of them)
- You may change the tense (past, present, future), form (noun, verb, adjective), number (singular/plural), or objects of phrases to make the content more natural and fluent. For example: "look forward to it" can become "looking forward to the trip"
- The content should be natural and readable, at an intermediate English level
- Each sentence should be practical and educational
- The Chinese translation should be natural, fluent, and accurate — not word-by-word translation

For "article" mode:
- Write a coherent, well-structured article (3-6 paragraphs)
- Use proper written English: formal tone, topic sentences, transitions, logical flow
- The style should read like a real essay or news article, NOT like a conversation
- Return sentences split by sentence (one per entry)
- No speaker field needed

For "dialogue" mode:
- Write a natural, realistic conversation between exactly 2 people
- Use speaker labels: "A" and "B" only
- Use natural spoken English: contractions (I'm, don't, gonna), fillers (well, you know, I mean), short sentences, interruptions, reactions (Oh really?, That's great!)
- The dialogue should sound like real people talking, NOT like written text read aloud
- Each line of dialogue is one entry with speaker and text

Return a JSON object:
{
  "title": "A short title for the article/dialogue",
  "sentences": [{"speaker": null, "text": "English sentence", "chinese": "中文翻譯"}, ...] for article mode,
              or [{"speaker": "A", "text": "English line", "chinese": "中文翻譯"}, ...] for dialogue mode,
  "used_words": ["word1", "word2", ...] (list of provided words that were actually used)
}
Always return valid JSON and nothing else."""


@router.post("/generate-article", response_model=GenerateArticleResponse)
async def generate_article(
    request: GenerateArticleRequest,
    user: User = Depends(get_current_user),
):
    user_message = json.dumps({
        "words": request.words,
        "mode": request.mode,
        "ratio": request.ratio,
    }, ensure_ascii=False)

    response = await client.chat.completions.create(
        model="gpt-5.4",
        messages=[
            {"role": "system", "content": ARTICLE_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
    )

    data = json.loads(response.choices[0].message.content)
    return GenerateArticleResponse(**data)


# --- Audio ---

@router.post("/generate-audio")
async def generate_audio(
    request: AudioVideoRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sentences = [s.model_dump() for s in request.sentences]
    mp3_bytes = await audio_service.build_combined_audio(sentences)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await save_file(db, user.id, f"{today}_article.mp3", "mp3", mp3_bytes)

    return StreamingResponse(
        io.BytesIO(mp3_bytes),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "attachment; filename=article.mp3"},
    )


# --- Video ---

@router.post("/generate-video")
async def generate_video(
    request: AudioVideoRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sentences = [s.model_dump() for s in request.sentences]
    mp3_bytes, timings = await audio_service.build_audio_with_timing(sentences)
    video_bytes = video_service.build_video_from_audio_and_timings(mp3_bytes, timings)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await save_file(db, user.id, f"{today}_article.mp4", "mp4", video_bytes)

    return StreamingResponse(
        io.BytesIO(video_bytes),
        media_type="video/mp4",
        headers={"Content-Disposition": "attachment; filename=article.mp4"},
    )


# --- Article PDF ---

@router.post("/generate-article-pdf")
async def generate_article_pdf_endpoint(
    request: ArticlePdfRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sentences = [s.model_dump() for s in request.sentences]
    response, pdf_bytes, filename = build_article_pdf(
        request.title, sentences, request.used_words
    )
    await save_file(db, user.id, filename, "pdf", pdf_bytes)
    return response


# --- Review Video ---

@router.post("/generate-review-video")
async def generate_review_video(
    request: ReviewVideoRequest,
    user: User = Depends(get_current_user),
):
    if not request.words:
        raise HTTPException(status_code=400, detail="No words provided")

    # Build sentences for audio + timing
    sentences = []
    for w in request.words:
        lines = [w.english]
        if w.kk_phonetic:
            lines.append(w.kk_phonetic)
        if w.chinese:
            lines.append(w.chinese)
        if w.mnemonic:
            lines.append(w.mnemonic)
        display = "\n".join(lines)
        sentences.append({"text": w.english, "display": display})

    # Generate audio with extra reading time
    mp3_bytes, timings = await audio_service.build_audio_with_timing(
        [{"text": s["text"]} for s in sentences], pause_ms=800
    )

    # Adjust timings to use display text and add reading time
    adjusted = []
    for i, (start, end, _) in enumerate(timings):
        display = sentences[i]["display"]
        reading_time = max(2.0, len(display) * 0.05)
        adjusted.append((start, end + reading_time, display))

    video_bytes = video_service.build_video_from_audio_and_timings(
        mp3_bytes, adjusted, font_size=48, alignment=5, margin_v=10
    )

    return StreamingResponse(
        io.BytesIO(video_bytes),
        media_type="video/mp4",
        headers={"Content-Disposition": "attachment; filename=review.mp4"},
    )


# --- Article CRUD ---

@router.post("/articles", response_model=ArticleOut)
async def save_article(
    payload: SaveArticleRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    article = Article(
        user_id=user.id,
        title=payload.title,
        input_words=payload.input_words,
        mode=payload.mode,
        ratio=payload.ratio,
        sentences=[s.model_dump() for s in payload.sentences],
        used_words=payload.used_words,
    )
    db.add(article)
    await db.commit()
    await db.refresh(article)
    return article


@router.get("/articles", response_model=list[ArticleSummary])
async def list_articles(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Article)
        .where(Article.user_id == user.id)
        .order_by(Article.created_at.desc())
    )
    return result.scalars().all()


@router.get("/articles/{article_id}", response_model=ArticleOut)
async def get_article(
    article_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Article).where(Article.id == article_id, Article.user_id == user.id)
    )
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.delete("/articles/{article_id}")
async def delete_article(
    article_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Article).where(Article.id == article_id, Article.user_id == user.id)
    )
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    await db.delete(article)
    await db.commit()
    return {"ok": True}
