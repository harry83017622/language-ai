import json
import os

from openai import AsyncOpenAI

from app.schemas import GenerateRequest, WordGenerateResult

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = """You are a Japanese language teacher for Traditional Chinese (繁體中文) speaking students from Taiwan.
Your target audience is Taiwanese students learning Japanese. You think in 繁體中文 and use natural spoken Taiwanese Mandarin.

For each Japanese word/phrase the user provides, generate the requested fields:
- definition: Traditional Chinese translation (繁體中文)
- reading: Hiragana reading (ふりがな) for the word, e.g. たべる, べんきょう
- example_sentence: A natural Japanese example sentence using this word. Include furigana in parentheses for kanji, e.g. 毎日（まいにち）日本語（にほんご）を勉強（べんきょう）しています。
- mnemonic_options: Generate exactly 3 memorable associations to help remember the word.
  If the input contains no kanji (pure hiragana/katakana), focus on sound associations with Chinese.
  If the input contains kanji, use kanji decomposition or shared meaning with Chinese.

  Good examples:
  - 勉強（べんきょう）→ "勉和強在中文裡是'勉強'的意思，但日文是'學習'，要'勉強'自己去'學習'才會進步"
  - 大丈夫（だいじょうぶ）→ "中文的'大丈夫'是男子漢，日文是'沒問題'——大丈夫遇到事情都說沒問題"
  - 切手（きって）→ "中文'切手'好痛，但日文是'郵票'——想像用手去撕郵票的動作"
  - 食べる（たべる）→ "發音像'他杯嚕'——他把杯子裡的東西全吃了"

  Bad examples (DO NOT generate):
  - "たべる的意思是吃" ← just repeating the definition, not a mnemonic
  - "べんきょう = 勉強" ← just transliteration, no memory aid

  Return as a JSON array of 3 strings.

Return a JSON object with a "results" key containing an array. Each element has the fields: term, definition, reading, example_sentence, mnemonic_options.
Only include fields that were requested. For fields not requested, set them to null.
Example format: {"results": [{"term": "食べる", "definition": "吃", ...}]}
Always return valid JSON and nothing else."""


async def generate_words(request: GenerateRequest) -> list[WordGenerateResult]:
    words_desc = []
    for w in request.words:
        fields = []
        if w.need_definition:
            fields.append("definition")
        if w.need_reading:
            fields.append("reading")
        if w.need_example:
            fields.append("example_sentence")
        if w.need_mnemonic:
            fields.append("mnemonic_options")
        words_desc.append({"term": w.term, "generate_fields": fields})

    user_message = json.dumps(words_desc, ensure_ascii=False)

    response = await client.chat.completions.create(
        model="gpt-5.4",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    print(f"[LLM RAW] {content}", flush=True)
    data = json.loads(content)

    # Handle various LLM response shapes
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        # Check if this dict IS a single word result (has "term" key)
        if "term" in data:
            items = [data]
        else:
            # Find a list-of-dicts value
            items = []
            for key in ("results", "words"):
                if key in data and isinstance(data[key], list):
                    items = data[key]
                    break
            if not items:
                for v in data.values():
                    if isinstance(v, list) and v and isinstance(v[0], dict):
                        items = v
                        break
    else:
        items = []

    results = []
    for item in items:
        if not isinstance(item, dict):
            continue
        # Handle legacy "mnemonic" field from LLM response
        if "mnemonic" in item and "mnemonic_options" not in item:
            m = item.pop("mnemonic")
            if m:
                if isinstance(m, list):
                    item["mnemonic_options"] = m
                else:
                    item["mnemonic_options"] = [m]
        results.append(WordGenerateResult(**item))
    return results
