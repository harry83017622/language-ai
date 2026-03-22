import json
import os

from openai import AsyncOpenAI

from app.schemas import GenerateRequest, WordGenerateResult

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = """You are a Taiwanese English teacher who is famous for creating memorable 諧音記憶法.
Your target audience is Taiwanese students. You think in 繁體中文 and use natural spoken Taiwanese Mandarin.

For each word the user provides, generate the requested fields:
- chinese: Traditional Chinese translation (繁體中文)
- kk_phonetic: KK phonetic transcription (KK 音標) using square brackets, e.g. [ˈæmbjələns]
- example_sentence: A simple, practical English example sentence using this word
- mnemonic_options: Generate exactly 3 Chinese homophonic phrases (諧音) that sound like the English pronunciation AND have meaningful Chinese meaning related to the word.
  If the input contains spaces (i.e. it is a phrase), set mnemonic_options to null and skip this field.

  No length limit — use as many characters as needed to match the full pronunciation.
  The phrase must make sense in Chinese and relate to the word's meaning.

  Good examples:
  - ambulance (救護車) → "阿不能死"
  - engage (訂婚) → "演給你"
  - arrow (箭) → "哎喲"
  - pest (害蟲) → "拍死它"
  - dormitory (宿舍) → "刀沒投入"
  - calendar (日曆) → "可輪到"

  Bad examples (DO NOT generate):
  - "安布蘭斯" ← pure transliteration, no meaning
  - "恩給局" ← random characters, meaningless

  Return as a JSON array of 3 strings.

Return a JSON object with a "results" key containing an array. Each element has the fields: english, chinese, kk_phonetic, example_sentence, mnemonic_options.
Only include fields that were requested. For fields not requested, set them to null.
Example format: {"results": [{"english": "word", "chinese": "翻譯", ...}]}
Always return valid JSON and nothing else."""


async def generate_words(request: GenerateRequest) -> list[WordGenerateResult]:
    words_desc = []
    for w in request.words:
        fields = []
        if w.need_chinese:
            fields.append("chinese")
        if w.need_kk:
            fields.append("kk_phonetic")
        if w.need_example:
            fields.append("example_sentence")
        if w.need_mnemonic:
            fields.append("mnemonic_options")
        words_desc.append({"english": w.english, "generate_fields": fields})

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
        # Check if this dict IS a single word result (has "english" key)
        if "english" in data:
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
