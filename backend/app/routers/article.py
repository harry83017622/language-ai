import datetime
import io
import json
import os
import subprocess
import tempfile
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel
from pydub import AudioSegment
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Article, User

router = APIRouter(prefix="/api", tags=["article"])
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

VOICE_MAP = {
    "A": "alloy",
    "B": "nova",
    "C": "echo",
    "D": "shimmer",
}


# --- Schemas ---

class Sentence(BaseModel):
    speaker: str | None = None
    text: str


class GenerateArticleRequest(BaseModel):
    words: list[str]
    mode: str = "article"  # "article" or "dialogue"
    ratio: float = 0.9


class GenerateArticleResponse(BaseModel):
    title: str
    sentences: list[Sentence]
    used_words: list[str]


class SaveArticleRequest(BaseModel):
    title: str
    input_words: list[str]
    mode: str
    ratio: float
    sentences: list[Sentence]
    used_words: list[str]


class ArticleOut(BaseModel):
    id: uuid.UUID
    title: str
    input_words: list[str]
    mode: str
    ratio: float
    sentences: list[Sentence]
    used_words: list[str]
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class ArticleSummary(BaseModel):
    id: uuid.UUID
    title: str
    mode: str
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class AudioVideoRequest(BaseModel):
    sentences: list[Sentence]


# --- Article Generation ---

ARTICLE_SYSTEM_PROMPT = """You are an English writing assistant for a Taiwanese student.
Generate a short English article or dialogue using the provided vocabulary words.

Rules:
- Use approximately the specified ratio of the provided words (e.g., 90% means use ~90% of them)
- The content should be natural and readable, at an intermediate English level
- Each sentence should be practical and educational

For "article" mode:
- Write a coherent article (3-6 paragraphs)
- Return sentences split by sentence (one per entry)
- No speaker field needed

For "dialogue" mode:
- Write a natural conversation between exactly 2 people
- Use speaker labels: "A" and "B" only
- Make the dialogue feel natural and conversational
- Each line of dialogue is one entry with speaker and text

Return a JSON object:
{
  "title": "A short title for the article/dialogue",
  "sentences": [{"speaker": null, "text": "sentence"}, ...] for article mode,
              or [{"speaker": "A", "text": "line"}, {"speaker": "B", "text": "line"}, ...] for dialogue mode,
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


# --- Audio Generation ---

async def _generate_sentence_audio(text: str, voice: str) -> bytes:
    response = await client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=text,
        response_format="mp3",
    )
    return response.content


@router.post("/generate-audio")
async def generate_audio(
    request: AudioVideoRequest,
    user: User = Depends(get_current_user),
):
    combined = AudioSegment.empty()
    pause = AudioSegment.silent(duration=500)  # 500ms between sentences

    for sentence in request.sentences:
        voice = VOICE_MAP.get(sentence.speaker or "", "alloy")
        audio_bytes = await _generate_sentence_audio(sentence.text, voice)
        segment = AudioSegment.from_mp3(io.BytesIO(audio_bytes))
        combined += segment + pause

    buffer = io.BytesIO()
    combined.export(buffer, format="mp3")
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "attachment; filename=article.mp3"},
    )


# --- Video Generation ---

def _seconds_to_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


@router.post("/generate-video")
async def generate_video(
    request: AudioVideoRequest,
    user: User = Depends(get_current_user),
):
    # Generate audio for each sentence and track timing
    segments: list[tuple[str, AudioSegment]] = []
    pause = AudioSegment.silent(duration=500)

    for sentence in request.sentences:
        voice = VOICE_MAP.get(sentence.speaker or "", "alloy")
        audio_bytes = await _generate_sentence_audio(sentence.text, voice)
        segment = AudioSegment.from_mp3(io.BytesIO(audio_bytes))
        display = f"{sentence.speaker}: {sentence.text}" if sentence.speaker else sentence.text
        segments.append((display, segment))

    # Build combined audio and SRT
    combined = AudioSegment.empty()
    srt_lines = []
    current_time = 0.0

    for i, (display_text, segment) in enumerate(segments):
        start = current_time
        end = current_time + len(segment) / 1000.0
        srt_lines.append(f"{i + 1}")
        srt_lines.append(f"{_seconds_to_srt_time(start)} --> {_seconds_to_srt_time(end)}")
        srt_lines.append(display_text)
        srt_lines.append("")
        combined += segment + pause
        current_time = end + 0.5  # 500ms pause

    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.mp3")
        srt_path = os.path.join(tmpdir, "subs.srt")
        output_path = os.path.join(tmpdir, "output.mp4")

        combined.export(audio_path, format="mp3")
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write("\n".join(srt_lines))

        duration = len(combined) / 1000.0

        # ffmpeg: black video + burned subtitles + audio
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=black:s=1280x720:d={duration}",
            "-i", audio_path,
            "-vf", f"subtitles={srt_path}:fontsdir=/app/fonts:force_style='FontName=Noto Sans CJK TC,FontSize=28,PrimaryColour=&Hffffff,Alignment=2,MarginV=40'",
            "-c:v", "libx264", "-preset", "fast", "-crf", "28",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            output_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        with open(output_path, "rb") as f:
            video_bytes = f.read()

    buffer = io.BytesIO(video_bytes)
    return StreamingResponse(
        buffer,
        media_type="video/mp4",
        headers={"Content-Disposition": "attachment; filename=article.mp4"},
    )


# --- Save / Load Articles ---

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


# --- Review MP4 (word-by-word with mnemonic) ---

class ReviewWord(BaseModel):
    english: str
    chinese: str | None = None
    kk_phonetic: str | None = None
    mnemonic: str | None = None


class ReviewVideoRequest(BaseModel):
    words: list[ReviewWord]


@router.post("/generate-review-video")
async def generate_review_video(
    request: ReviewVideoRequest,
    user: User = Depends(get_current_user),
):
    if not request.words:
        raise HTTPException(status_code=400, detail="No words provided")

    segments: list[tuple[str, AudioSegment]] = []
    pause = AudioSegment.silent(duration=800)

    for w in request.words:
        # TTS: read the English word
        audio_bytes = await _generate_sentence_audio(w.english, "alloy")
        segment = AudioSegment.from_mp3(io.BytesIO(audio_bytes))

        # Build display text for subtitle
        lines = [w.english]
        if w.kk_phonetic:
            lines.append(w.kk_phonetic)
        if w.chinese:
            lines.append(w.chinese)
        if w.mnemonic:
            lines.append(w.mnemonic)
        display = "\\N".join(lines)  # ASS/SRT newline

        segments.append((display, segment))

    # Build combined audio + SRT
    combined = AudioSegment.empty()
    srt_lines = []
    current_ms = 0

    pause_ms = 800
    for i, (display_text, segment) in enumerate(segments):
        reading_ms = max(2000, int(len(display_text) * 50))
        segment_ms = len(segment)

        # Total time for this word: audio + reading silence + pause
        total_ms = segment_ms + reading_ms + pause_ms

        start = current_ms / 1000.0
        end = (current_ms + segment_ms + reading_ms) / 1000.0

        srt_lines.append(f"{i + 1}")
        srt_lines.append(f"{_seconds_to_srt_time(start)} --> {_seconds_to_srt_time(end)}")
        srt_lines.append(display_text.replace("\\N", "\n"))
        srt_lines.append("")

        combined += segment + AudioSegment.silent(duration=reading_ms) + AudioSegment.silent(duration=pause_ms)
        current_ms += total_ms

    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.mp3")
        srt_path = os.path.join(tmpdir, "subs.srt")
        output_path = os.path.join(tmpdir, "review.mp4")

        combined.export(audio_path, format="mp3")
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write("\n".join(srt_lines))

        duration = len(combined) / 1000.0

        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=black:s=1280x720:d={duration}",
            "-i", audio_path,
            "-vf", f"subtitles={srt_path}:fontsdir=/app/fonts:force_style='FontName=Noto Sans CJK TC,FontSize=48,PrimaryColour=&Hffffff,Alignment=5,MarginV=10'",
            "-c:v", "libx264", "-preset", "fast", "-crf", "28",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            output_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        with open(output_path, "rb") as f:
            video_bytes = f.read()

    buffer = io.BytesIO(video_bytes)
    return StreamingResponse(
        buffer,
        media_type="video/mp4",
        headers={"Content-Disposition": "attachment; filename=review.mp4"},
    )
