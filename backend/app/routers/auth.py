import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, verify_google_token
from app.database import get_db
from app.models import User
from app.schemas import UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


class GoogleLoginRequest(BaseModel):
    credential: str


class LoginResponse(BaseModel):
    access_token: str
    user: UserOut


@router.post("/google", response_model=LoginResponse)
async def google_login(payload: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        google_data = await verify_google_token(payload.credential)
    except Exception as e:
        print(f"Google token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google token")

    result = await db.execute(select(User).where(User.google_id == google_data["sub"]))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            google_id=google_data["sub"],
            email=google_data["email"],
            name=google_data.get("name", ""),
            picture=google_data.get("picture"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        user.name = google_data.get("name", user.name)
        user.picture = google_data.get("picture", user.picture)
        await db.commit()

    token = create_access_token(str(user.id))
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))


# --- Test-only endpoint (only available when E2E_TEST=1) ---

if os.getenv("E2E_TEST") == "1":
    @router.post("/test-login", response_model=LoginResponse)
    async def test_login(db: AsyncSession = Depends(get_db)):
        """Create or get a test user and return JWT. Only available in test mode."""
        result = await db.execute(select(User).where(User.google_id == "e2e-test-user"))
        user = result.scalar_one_or_none()
        if not user:
            user = User(
                google_id="e2e-test-user",
                email="e2e@test.com",
                name="E2E Test User",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        token = create_access_token(str(user.id))
        return LoginResponse(access_token=token, user=UserOut.model_validate(user))
