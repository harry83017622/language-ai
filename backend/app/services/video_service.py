"""Video generation service using ffmpeg."""

import io
import os
import subprocess
import tempfile


def _seconds_to_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_video_from_audio_and_timings(
    mp3_bytes: bytes,
    timings: list[tuple[float, float, str]],
    font_size: int = 28,
    alignment: int = 2,
    margin_v: int = 40,
) -> bytes:
    """Build an MP4 video with subtitle overlay from audio + timing data.

    Args:
        mp3_bytes: Combined MP3 audio.
        timings: List of (start_sec, end_sec, display_text).
        font_size: Subtitle font size.
        alignment: ASS alignment (2=bottom-center, 5=middle-center).
        margin_v: Vertical margin for subtitles.

    Returns:
        MP4 bytes.
    """
    # Build SRT
    srt_lines = []
    for i, (start, end, text) in enumerate(timings):
        srt_lines.append(f"{i + 1}")
        srt_lines.append(f"{_seconds_to_srt_time(start)} --> {_seconds_to_srt_time(end)}")
        srt_lines.append(text)
        srt_lines.append("")

    total_duration = timings[-1][1] + 1.0 if timings else 1.0

    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.mp3")
        srt_path = os.path.join(tmpdir, "subs.srt")
        output_path = os.path.join(tmpdir, "output.mp4")

        with open(audio_path, "wb") as f:
            f.write(mp3_bytes)
        with open(srt_path, "w", encoding="utf-8") as f:
            f.write("\n".join(srt_lines))

        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=black:s=1280x720:d={total_duration}",
            "-i", audio_path,
            "-vf", (
                f"subtitles={srt_path}:fontsdir=/app/fonts"
                f":force_style='FontName=Noto Sans CJK JP,FontSize={font_size},"
                f"PrimaryColour=&Hffffff,Alignment={alignment},MarginV={margin_v}'"
            ),
            "-c:v", "libx264", "-preset", "fast", "-crf", "28",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            output_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        with open(output_path, "rb") as f:
            return f.read()
