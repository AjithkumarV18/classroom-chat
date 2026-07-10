from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.authz import require_roles
from app.database import session_recordings_collection

router = APIRouter(prefix="/session-recordings", tags=["session recordings"], dependencies=[Depends(require_roles("Student", "Teacher", "Employer", "Employee", "Admin"))])


class SessionRecordingCreate(BaseModel):
    recording_id: str = Field(..., min_length=1, max_length=80)
    session_name: str = Field(..., min_length=1, max_length=160)
    duration: str = Field(..., min_length=1, max_length=60)
    video_url: str | None = None
    download_url: str | None = None
    video_file_name: str | None = None
    uploaded_date: datetime | None = None


class SessionRecordingUpdate(BaseModel):
    recording_id: str | None = Field(default=None, min_length=1, max_length=80)
    session_name: str | None = Field(default=None, min_length=1, max_length=160)
    duration: str | None = Field(default=None, min_length=1, max_length=60)
    video_url: str | None = None
    download_url: str | None = None
    video_file_name: str | None = None
    uploaded_date: datetime | None = None


class SessionRecordingResponse(BaseModel):
    id: str
    recording_id: str
    session_name: str
    duration: str
    video_url: str | None = None
    download_url: str | None = None
    video_file_name: str | None = None
    uploaded_date: datetime
    created_at: datetime
    updated_at: datetime


def serialize_session_recording(document: dict) -> SessionRecordingResponse:
    return SessionRecordingResponse(
        id=str(document["_id"]),
        recording_id=document["recording_id"],
        session_name=document["session_name"],
        duration=document["duration"],
        video_url=document.get("video_url"),
        download_url=document.get("download_url"),
        video_file_name=document.get("video_file_name"),
        uploaded_date=document["uploaded_date"],
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def object_id_or_404(item_id: str) -> ObjectId:
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session recording not found.")
    return ObjectId(item_id)


@router.post("", response_model=SessionRecordingResponse, status_code=status.HTTP_201_CREATED)
async def create_session_recording(payload: SessionRecordingCreate) -> SessionRecordingResponse:
    now = datetime.now(timezone.utc)
    document = {
        **payload.model_dump(exclude={"uploaded_date"}),
        "uploaded_date": payload.uploaded_date or now,
        "created_at": now,
        "updated_at": now,
    }
    result = await session_recordings_collection.insert_one(document)
    created = await session_recordings_collection.find_one({"_id": result.inserted_id})
    return serialize_session_recording(created)


@router.get("", response_model=list[SessionRecordingResponse])
async def list_session_recordings() -> list[SessionRecordingResponse]:
    cursor = session_recordings_collection.find().sort("uploaded_date", -1)
    return [serialize_session_recording(document) async for document in cursor]


@router.get("/{session_recording_id}", response_model=SessionRecordingResponse)
async def get_session_recording(session_recording_id: str) -> SessionRecordingResponse:
    document = await session_recordings_collection.find_one({"_id": object_id_or_404(session_recording_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session recording not found.")
    return serialize_session_recording(document)


@router.put("/{session_recording_id}", response_model=SessionRecordingResponse)
async def update_session_recording(
    session_recording_id: str,
    payload: SessionRecordingUpdate,
) -> SessionRecordingResponse:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_session_recording(session_recording_id)

    updates["updated_at"] = datetime.now(timezone.utc)
    result = await session_recordings_collection.update_one(
        {"_id": object_id_or_404(session_recording_id)},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session recording not found.")
    return await get_session_recording(session_recording_id)


@router.delete("/{session_recording_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session_recording(session_recording_id: str) -> None:
    result = await session_recordings_collection.delete_one({"_id": object_id_or_404(session_recording_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session recording not found.")


