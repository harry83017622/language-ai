import os
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GeneratedFile

STORE_DIR = "/app/generated_files"
os.makedirs(STORE_DIR, exist_ok=True)


async def save_file(
    db: AsyncSession,
    user_id: uuid.UUID,
    filename: str,
    file_type: str,
    content: bytes,
) -> GeneratedFile:
    file_id = uuid.uuid4()
    safe_name = f"{file_id}_{filename}"
    file_path = os.path.join(STORE_DIR, safe_name)

    with open(file_path, "wb") as f:
        f.write(content)

    record = GeneratedFile(
        id=file_id,
        user_id=user_id,
        filename=filename,
        file_type=file_type,
        file_path=file_path,
    )
    db.add(record)
    await db.commit()
    return record


async def list_recent_files(db: AsyncSession, user_id: uuid.UUID, limit: int = 10) -> list[GeneratedFile]:
    result = await db.execute(
        select(GeneratedFile)
        .where(GeneratedFile.user_id == user_id)
        .order_by(GeneratedFile.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
