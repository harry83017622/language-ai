from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.models import User
from app.schemas import GenerateRequest, GenerateResponse
from app.services.llm_service import generate_words

router = APIRouter(prefix="/api", tags=["llm"])


@router.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest, user: User = Depends(get_current_user)):
    results = await generate_words(request)
    return GenerateResponse(results=results)
