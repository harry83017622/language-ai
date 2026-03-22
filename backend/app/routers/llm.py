from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User, Word, WordGroup
from app.schemas import GenerateRequest, GenerateResponse, WordGenerateRequest, WordGenerateResult
from app.services.llm_service import generate_words

router = APIRouter(prefix="/api", tags=["llm"])


@router.post("/generate", response_model=GenerateResponse)
async def generate(
    request: GenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Look up existing words in DB first
    english_list = [w.english.lower() for w in request.words]
    result = await db.execute(
        select(Word)
        .join(WordGroup)
        .where(
            WordGroup.user_id == user.id,
            func.lower(Word.english).in_(english_list),
        )
    )
    existing: dict[str, Word] = {}
    for row in result.scalars().all():
        key = row.english.lower()
        if key not in existing:
            existing[key] = row

    # Split: words with DB hits vs words needing LLM
    final_results: list[WordGenerateResult] = []
    words_for_llm: list[WordGenerateRequest] = []
    llm_indices: list[int] = []  # track position in final_results

    for w in request.words:
        is_phrase = " " in w.english.strip()
        # Phrases/sentences: skip mnemonic entirely
        want_mnemonic = w.need_mnemonic and not is_phrase

        db_word = existing.get(w.english.lower())
        if db_word:
            # Use DB values, only generate fields that DB doesn't have
            needs_llm = False
            result_dict: dict = {"english": w.english}
            if w.need_chinese:
                result_dict["chinese"] = db_word.chinese
                if not db_word.chinese:
                    needs_llm = True
            if w.need_kk:
                result_dict["kk_phonetic"] = db_word.kk_phonetic
                if not db_word.kk_phonetic:
                    needs_llm = True
            if w.need_example:
                result_dict["example_sentence"] = db_word.example_sentence
                if not db_word.example_sentence:
                    needs_llm = True
            if want_mnemonic:
                if db_word.mnemonic:
                    result_dict["mnemonic_options"] = [db_word.mnemonic]
                else:
                    needs_llm = True

            if needs_llm:
                idx = len(final_results)
                final_results.append(WordGenerateResult(**result_dict))
                words_for_llm.append(WordGenerateRequest(
                    english=w.english,
                    need_chinese=w.need_chinese and not db_word.chinese,
                    need_kk=w.need_kk and not db_word.kk_phonetic,
                    need_example=w.need_example and not db_word.example_sentence,
                    need_mnemonic=want_mnemonic and not db_word.mnemonic,
                ))
                llm_indices.append(idx)
            else:
                final_results.append(WordGenerateResult(**result_dict))
        else:
            # No DB hit, need full LLM generation
            idx = len(final_results)
            final_results.append(WordGenerateResult(english=w.english))
            words_for_llm.append(WordGenerateRequest(
                english=w.english,
                need_chinese=w.need_chinese,
                need_kk=w.need_kk,
                need_example=w.need_example,
                need_mnemonic=want_mnemonic,
            ))
            llm_indices.append(idx)

    # Call LLM for words that need it
    if words_for_llm:
        llm_request = GenerateRequest(words=words_for_llm)
        llm_results = await generate_words(llm_request)

        for i, llm_result in enumerate(llm_results):
            if i < len(llm_indices):
                idx = llm_indices[i]
                existing_result = final_results[idx]
                # Merge: LLM fills in missing fields
                final_results[idx] = WordGenerateResult(
                    english=existing_result.english,
                    chinese=existing_result.chinese or llm_result.chinese,
                    kk_phonetic=existing_result.kk_phonetic or llm_result.kk_phonetic,
                    example_sentence=existing_result.example_sentence or llm_result.example_sentence,
                    mnemonic_options=existing_result.mnemonic_options or llm_result.mnemonic_options,
                )

    return GenerateResponse(results=final_results)
