"""Audio generation service using OpenAI TTS."""

import io
import os

from openai import AsyncOpenAI
from pydub import AudioSegment

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

VOICE_MAP = {
    "A": "alloy",
    "B": "nova",
    "C": "echo",
    "D": "shimmer",
}


async def generate_sentence_audio(text: str, voice: str = "alloy") -> bytes:
    """Generate TTS audio for a single sentence."""
    response = await client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=text,
        response_format="mp3",
    )
    return response.content


def get_voice_for_speaker(speaker: str | None) -> str:
    """Map a speaker label to a TTS voice."""
    return VOICE_MAP.get(speaker or "", "alloy")


async def build_combined_audio(
    sentences: list[dict],
    pause_ms: int = 500,
) -> bytes:
    """Build combined MP3 from multiple sentences with pauses.

    Each sentence dict should have: text, speaker (optional).
    Returns MP3 bytes.
    """
    combined = AudioSegment.empty()
    pause = AudioSegment.silent(duration=pause_ms)

    for s in sentences:
        voice = get_voice_for_speaker(s.get("speaker"))
        audio_bytes = await generate_sentence_audio(s["text"], voice)
        segment = AudioSegment.from_mp3(io.BytesIO(audio_bytes))
        combined += segment + pause

    buffer = io.BytesIO()
    combined.export(buffer, format="mp3")
    return buffer.getvalue()


async def build_audio_with_timing(
    sentences: list[dict],
    pause_ms: int = 500,
) -> tuple[bytes, list[tuple[float, float, str]]]:
    """Build combined MP3 and return timing info for each sentence.

    Returns (mp3_bytes, [(start_sec, end_sec, display_text), ...]).
    """
    combined = AudioSegment.empty()
    pause = AudioSegment.silent(duration=pause_ms)
    timings: list[tuple[float, float, str]] = []
    current_ms = 0

    for s in sentences:
        voice = get_voice_for_speaker(s.get("speaker"))
        text = s["text"]
        chinese = s.get("definition")
        speaker = s.get("speaker")

        audio_bytes = await generate_sentence_audio(text, voice)
        segment = AudioSegment.from_mp3(io.BytesIO(audio_bytes))
        segment_ms = len(segment)

        # Build display text
        en_line = f"{speaker}: {text}" if speaker else text
        display = f"{en_line}\n{chinese}" if chinese else en_line

        start = current_ms / 1000.0
        end = (current_ms + segment_ms) / 1000.0
        timings.append((start, end, display))

        combined += segment + pause
        current_ms += segment_ms + pause_ms

    buffer = io.BytesIO()
    combined.export(buffer, format="mp3")
    return buffer.getvalue(), timings
