"""
Language configuration for the vocabulary tool.

Change these values to switch the target learning language.
All language-specific labels and settings are centralized here.
"""

LANG = {
    # Display labels
    "target": "日文",
    "native": "中文",
    "reading": "讀音",
    "mnemonic": "記憶法",
    "example": "例句",
    # App metadata
    "app_title": "日文單字工具",
    "default_email_subject": "日文單字工具",
    # TTS / Speech
    "tts_lang": "ja-JP",
    # Font (for video subtitles)
    "cjk_font": "Noto Sans CJK JP",
}

# Field labels used in exports (CSV, PDF, email HTML)
FIELD_LABELS = {
    "term": LANG["target"],
    "definition": LANG["native"],
    "reading": LANG["reading"],
    "mnemonic": LANG["mnemonic"],
    "example_sentence": LANG["example"],
}

# CSV column auto-detection patterns
COLUMN_PATTERNS = {
    "term": ["japanese", "日文", "日本語", "単語", "word", "term", "vocab", "vocabulary"],
    "definition": ["chinese", "中文", "翻譯", "解釋", "meaning", "definition"],
    "reading": ["reading", "讀音", "ふりがな", "furigana", "hiragana", "発音", "phonetic"],
    "mnemonic": ["記憶", "mnemonic", "memory", "聯想", "故事"],
    "example_sentence": ["例句", "sentence", "example", "造句"],
}
