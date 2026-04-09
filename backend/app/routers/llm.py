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
    # Look up existing words in DB first (skip if force regenerate)
    existing: dict[str, Word] = {}
    if not request.force:
        term_list = [w.term.lower() for w in request.words]
        result = await db.execute(
            select(Word)
            .join(WordGroup)
            .where(
                WordGroup.user_id == user.id,
                func.lower(Word.term).in_(term_list),
            )
        )
        for row in result.scalars().all():
            key = row.term.lower()
            if key not in existing:
                existing[key] = row

    # Split: words with DB hits vs words needing LLM
    final_results: list[WordGenerateResult] = []
    words_for_llm: list[WordGenerateRequest] = []
    llm_indices: list[int] = []  # track position in final_results

    for w in request.words:
        want_mnemonic = w.need_mnemonic

        db_word = existing.get(w.term.lower())
        if db_word:
            # Use DB values, only generate fields that DB doesn't have
            needs_llm = False
            result_dict: dict = {"term": w.term}
            if w.need_definition:
                result_dict["definition"] = db_word.definition
                if not db_word.definition:
                    needs_llm = True
            if w.need_reading:
                result_dict["reading"] = db_word.reading
                if not db_word.reading:
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
                    term=w.term,
                    need_definition=w.need_definition and not db_word.definition,
                    need_reading=w.need_reading and not db_word.reading,
                    need_example=w.need_example and not db_word.example_sentence,
                    need_mnemonic=want_mnemonic and not db_word.mnemonic,
                ))
                llm_indices.append(idx)
            else:
                final_results.append(WordGenerateResult(**result_dict))
        else:
            # No DB hit, need full LLM generation
            idx = len(final_results)
            final_results.append(WordGenerateResult(term=w.term))
            words_for_llm.append(WordGenerateRequest(
                term=w.term,
                need_definition=w.need_definition,
                need_reading=w.need_reading,
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
                    term=existing_result.term,
                    definition=existing_result.definition or llm_result.definition,
                    reading=existing_result.reading or llm_result.reading,
                    example_sentence=existing_result.example_sentence or llm_result.example_sentence,
                    mnemonic_options=existing_result.mnemonic_options or llm_result.mnemonic_options,
                )

    return GenerateResponse(results=final_results)
