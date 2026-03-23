import subprocess
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import article, auth, llm, words


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Alembic migrations on startup
    subprocess.run(["alembic", "upgrade", "head"], check=True)
    yield


app = FastAPI(title="English Vocabulary Tool", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(article.router)
app.include_router(auth.router)
app.include_router(llm.router)
app.include_router(words.router)
