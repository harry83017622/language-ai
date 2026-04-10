"""JLPT vocabulary seed/import endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.services.seed_service import get_seed_status, import_level

router = APIRouter(prefix="/api/seed", tags=["seed"])


@router.get("/status")
async def seed_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_seed_status(db, user.id)


@router.post("/import/{level}")
async def seed_import(
    level: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await import_level(db, user.id, level)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result
