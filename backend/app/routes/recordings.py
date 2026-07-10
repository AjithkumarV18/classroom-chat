from datetime import datetime, timezone
from pathlib import Path
import shutil
import uuid

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.authz import require_roles
from app.database import recordings_collection

router = APIRouter(prefix="/recordings", tags=["recordings"], dependencies=[Depends(require_roles("Teacher", "Admin"))])
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


class RecordingCreate(BaseModel):
    recording_id: str = Field(..., min_length=1, max_length=80)
    session_name: str = Field(..., min_length=1, max_length=160)
    title: str = Field(..., min_length=1, max_length=160)
    video_file_name: str = Field(..., min_length=1, max_length=260)
    duration: str = Field(..., min_length=1, max_length=60)
    video_url: str | None = None
    download_url: str | None = None


class RecordingUpdate(BaseModel):
    recording_id: str | None = Field(default=None, min_length=1, max_length=80)
    session_name: str | None = Field(default=None, min_length=1, max_length=160)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    video_file_name: str | None = Field(default=None, min_length=1, max_length=260)
    duration: str | None = Field(default=None, min_length=1, max_length=60)
    video_url: str | None = None
    download_url: str | None = None


class RecordingResponse(BaseModel):
    id: str
    recording_id: str
    session_name: str
    title: str
    video_file_name: str
    duration: str
    video_url: str | None = None
    download_url: str | None = None
    uploaded_at: datetime
    updated_at: datetime


def serialize_recording(document: dict) -> RecordingResponse:
    return RecordingResponse(
        id=str(document["_id"]),
        recording_id=document["recording_id"],
        session_name=document["session_name"],
        title=document["title"],
        video_file_name=document["video_file_name"],
        duration=document["duration"],
        video_url=document.get("video_url"),
        download_url=document.get("download_url"),
        uploaded_at=document["uploaded_at"],
        updated_at=document["updated_at"],
    )


def object_id_or_404(item_id: str) -> ObjectId:
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found.")
    return ObjectId(item_id)


def safe_upload_name(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return f"{uuid.uuid4().hex}{suffix}"


@router.post("", response_model=RecordingResponse, status_code=status.HTTP_201_CREATED)
async def create_recording(payload: RecordingCreate) -> RecordingResponse:
    now = datetime.now(timezone.utc)
    document = {
        **payload.model_dump(),
        "uploaded_at": now,
        "updated_at": now,
    }
    result = await recordings_collection.insert_one(document)
    created = await recordings_collection.find_one({"_id": result.inserted_id})
    return serialize_recording(created)


@router.post("/upload", response_model=RecordingResponse, status_code=status.HTTP_201_CREATED)
async def upload_recording(
    recording_id: str = Form(...),
    session_name: str = Form(...),
    title: str = Form(...),
    duration: str = Form(...),
    video_file: UploadFile = File(...),
) -> RecordingResponse:
    if not video_file.content_type or not video_file.content_type.startswith("video/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a valid video file.",
        )

    stored_file_name = safe_upload_name(video_file.filename or "recording.mp4")
    stored_path = UPLOAD_DIR / stored_file_name

    with stored_path.open("wb") as buffer:
        shutil.copyfileobj(video_file.file, buffer)

    now = datetime.now(timezone.utc)
    document = {
        "recording_id": recording_id,
        "session_name": session_name,
        "title": title,
        "video_file_name": video_file.filename or stored_file_name,
        "stored_file_name": stored_file_name,
        "duration": duration,
        "video_url": f"/uploads/{stored_file_name}",
        "download_url": f"/api/recordings/download/{stored_file_name}",
        "uploaded_at": now,
        "updated_at": now,
    }
    result = await recordings_collection.insert_one(document)
    created = await recordings_collection.find_one({"_id": result.inserted_id})
    return serialize_recording(created)


@router.get("", response_model=list[RecordingResponse])
async def list_recordings() -> list[RecordingResponse]:
    cursor = recordings_collection.find().sort("uploaded_at", -1)
    return [serialize_recording(document) async for document in cursor]


@router.get("/download/{stored_file_name}")
async def download_recording(stored_file_name: str) -> FileResponse:
    stored_path = UPLOAD_DIR / stored_file_name
    if not stored_path.exists() or not stored_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video file not found.")

    recording = await recordings_collection.find_one({"stored_file_name": stored_file_name})
    download_name = recording.get("video_file_name", stored_file_name) if recording else stored_file_name
    return FileResponse(path=stored_path, filename=download_name, media_type="application/octet-stream")


@router.get("/{recording_object_id}", response_model=RecordingResponse)
async def get_recording(recording_object_id: str) -> RecordingResponse:
    document = await recordings_collection.find_one({"_id": object_id_or_404(recording_object_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found.")
    return serialize_recording(document)


@router.put("/{recording_object_id}", response_model=RecordingResponse)
async def update_recording(recording_object_id: str, payload: RecordingUpdate) -> RecordingResponse:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_recording(recording_object_id)

    updates["updated_at"] = datetime.now(timezone.utc)
    result = await recordings_collection.update_one(
        {"_id": object_id_or_404(recording_object_id)},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found.")
    return await get_recording(recording_object_id)


@router.delete("/{recording_object_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recording(recording_object_id: str) -> None:
    recording_object_id = object_id_or_404(recording_object_id)
    recording = await recordings_collection.find_one({"_id": recording_object_id})
    result = await recordings_collection.delete_one({"_id": recording_object_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found.")

    stored_file_name = recording.get("stored_file_name") if recording else None
    if stored_file_name:
        stored_path = UPLOAD_DIR / stored_file_name
        if stored_path.exists() and stored_path.is_file():
            stored_path.unlink()


