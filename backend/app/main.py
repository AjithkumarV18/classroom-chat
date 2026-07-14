from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import create_indexes
from app.routes.auth import router as auth_router
from app.routes.attendance import router as attendance_router
from app.routes.managed_sessions import router as managed_sessions_router
from app.routes.recordings import router as recordings_router
from app.routes.session_recordings import router as session_recordings_router
from app.routes.trainer_sessions import router as trainer_sessions_router
from app.database import attendance_collection
from app.config import settings

app = FastAPI(title="Classroom Chat API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_dir = Path(__file__).resolve().parents[1] / "uploads"
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


@app.on_event("startup")
async def on_startup() -> None:
    await create_indexes()


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/api/debug/mongo")
async def debug_mongo():
    docs = await attendance_collection.find().to_list(length=10)
    return {
        "mongodb_uri": settings.mongodb_uri,
        "database": settings.mongodb_db,
        "collection": attendance_collection.name,
        "count": len(docs),
        "documents": docs,
    }

app.include_router(auth_router, prefix="/api")
app.include_router(attendance_router, prefix="/api")
app.include_router(managed_sessions_router, prefix="/api")
app.include_router(trainer_sessions_router, prefix="/api")
app.include_router(recordings_router, prefix="/api")
app.include_router(session_recordings_router, prefix="/api")



