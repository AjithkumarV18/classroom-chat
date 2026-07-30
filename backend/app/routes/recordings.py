from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
import shutil
import uuid
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, model_validator

from app.authz import get_current_user, require_roles
from app.database import managed_sessions_collection, recordings_collection, trainer_sessions_collection, users_collection

router = APIRouter(prefix="/recordings", tags=["recordings"])
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

RecordingStatus = Literal["Pending Upload", "Processing", "Encoding Completed", "Ready", "Failed"]
Visibility = Literal["Public Batch", "Private Trainer"]
SortOrder = Literal["latest", "oldest"]


class RecordingCreate(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=120)
    batch_id: str = Field(..., min_length=1, max_length=120)
    trainer_id: str = Field(..., min_length=1, max_length=120)
    recording_title: str = Field(..., min_length=1, max_length=180)
    recording_description: str | None = Field(default="", max_length=1000)
    video_file_url: str = Field(..., min_length=1, max_length=500)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    recording_duration: str = Field(..., min_length=1, max_length=80)
    file_size: int = Field(default=0, ge=0)
    recording_status: RecordingStatus = "Pending Upload"
    recording_start_time: datetime | None = None
    recording_end_time: datetime | None = None
    recording_date: datetime | None = None
    download_enabled: bool = True
    visibility: Visibility = "Public Batch"
    mime_type: str | None = Field(default=None, max_length=160)
    original_filename: str | None = Field(default=None, max_length=255)
    processing_error: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def trim_values(self) -> "RecordingCreate":
        self.session_id = self.session_id.strip()
        self.batch_id = self.batch_id.strip()
        self.trainer_id = self.trainer_id.strip()
        self.recording_title = self.recording_title.strip()
        self.recording_description = (self.recording_description or "").strip()
        self.video_file_url = self.video_file_url.strip()
        if not all([self.session_id, self.batch_id, self.trainer_id, self.recording_title, self.video_file_url]):
            raise ValueError("Missing required recording fields.")
        return self


class RecordingUpdate(BaseModel):
    recording_title: str | None = Field(default=None, min_length=1, max_length=180)
    recording_description: str | None = Field(default=None, max_length=1000)
    visibility: Visibility | None = None
    thumbnail_url: str | None = Field(default=None, max_length=500)
    recording_status: RecordingStatus | None = None
    download_enabled: bool | None = None

    @model_validator(mode="after")
    def validate_update(self) -> "RecordingUpdate":
        if not self.model_dump(exclude_unset=True):
            raise ValueError("Provide at least one field to update.")
        if self.recording_title is not None:
            self.recording_title = self.recording_title.strip()
        if self.recording_description is not None:
            self.recording_description = self.recording_description.strip()
        if self.recording_title == "":
            raise ValueError("Recording title cannot be empty.")
        return self


class RecordingResponse(BaseModel):
    id: str
    recording_id: str
    session_id: str
    batch_id: str
    trainer_id: str
    recording_title: str
    recording_description: str
    video_file_url: str
    thumbnail_url: str | None = None
    recording_duration: str
    file_size: int
    recording_status: RecordingStatus
    recording_start_time: datetime | None = None
    recording_end_time: datetime | None = None
    recording_date: datetime
    playback_count: int
    download_enabled: bool
    visibility: Visibility
    download_count: int
    total_watch_duration: int
    unique_viewers: int
    last_viewed_at: datetime | None = None
    mime_type: str | None = None
    original_filename: str | None = None
    processing_error: str | None = None
    created_at: datetime
    updated_at: datetime


class RecordingListResponse(BaseModel):
    items: list[RecordingResponse]
    total: int
    page: int
    page_size: int


class PlaybackResponse(BaseModel):
    recording_id: str
    playback_url: str
    playback_token: str
    expires_at: datetime


class ViewTrackRequest(BaseModel):
    watch_duration_seconds: int = Field(default=0, ge=0)


class AnalyticsResponse(BaseModel):
    total_recordings: int
    total_views: int
    total_downloads: int
    most_viewed_recording: RecordingResponse | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_recording(document: dict) -> RecordingResponse:
    created_at = document.get("created_at") or document.get("uploaded_at") or utc_now()
    updated_at = document.get("updated_at") or created_at
    recording_id = document.get("recording_id") or str(document["_id"])
    video_file_url = document.get("video_file_url") or document.get("video_url") or ""
    return RecordingResponse(
        id=str(document["_id"]),
        recording_id=recording_id,
        session_id=document.get("session_id") or document.get("session_name") or "Unknown Session",
        batch_id=document.get("batch_id") or document.get("batch_name") or "Unassigned Batch",
        trainer_id=document.get("trainer_id") or "demo-teacher",
        recording_title=document.get("recording_title") or document.get("title") or document.get("session_name") or "Untitled Recording",
        recording_description=document.get("recording_description", ""),
        video_file_url=video_file_url,
        thumbnail_url=document.get("thumbnail_url"),
        recording_duration=document.get("recording_duration") or document.get("duration") or "0 min",
        file_size=int(document.get("file_size", 0)),
        recording_status=document.get("recording_status", "Pending Upload"),
        recording_start_time=document.get("recording_start_time"),
        recording_end_time=document.get("recording_end_time"),
        recording_date=document.get("recording_date") or document.get("uploaded_at") or created_at,
        playback_count=int(document.get("playback_count", 0)),
        download_enabled=bool(document.get("download_enabled", True)),
        visibility=document.get("visibility", "Public Batch"),
        download_count=int(document.get("download_count", 0)),
        total_watch_duration=int(document.get("total_watch_duration", 0)),
        unique_viewers=len(document.get("viewer_ids", [])),
        last_viewed_at=document.get("last_viewed_at"),
        mime_type=document.get("mime_type"),
        original_filename=document.get("original_filename"),
        processing_error=document.get("processing_error"),
        created_at=created_at,
        updated_at=updated_at,
    )


def recording_query(identifier: str) -> dict:
    return {"_id": ObjectId(identifier)} if ObjectId.is_valid(identifier) else {"recording_id": identifier}


def is_expired(value: datetime | None) -> bool:
    if not value:
        return True
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value < utc_now()


async def get_active_recording(identifier: str) -> dict:
    document = await recordings_collection.find_one({**recording_query(identifier), "is_deleted": {"$ne": True}})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found.")
    return document


async def session_exists(session_id: str) -> bool:
    return bool(await managed_sessions_collection.find_one({"session_id": session_id}) or await trainer_sessions_collection.find_one({"room_id": session_id}))


async def batch_exists(batch_id: str) -> bool:
    if ObjectId.is_valid(batch_id) and await trainer_sessions_collection.find_one({"_id": ObjectId(batch_id)}):
        return True
    return bool(await trainer_sessions_collection.find_one({"batch_name": batch_id}))


async def trainer_exists(trainer_id: str) -> bool:
    if trainer_id.startswith("demo-"):
        return True
    return bool(ObjectId.is_valid(trainer_id) and await users_collection.find_one({"_id": ObjectId(trainer_id), "role": {"$in": ["Teacher", "Admin"]}}))


async def validate_recording_references(payload: RecordingCreate, current_user: dict) -> None:
    trainer_session = await trainer_sessions_collection.find_one(
        {"room_id": payload.session_id}
    )
    if not trainer_session and not await session_exists(payload.session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    if not await batch_exists(payload.batch_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    if not await trainer_exists(payload.trainer_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer not found.")
    if trainer_session and trainer_session.get("batch_name") != payload.batch_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Session is not assigned to the selected batch.",
        )
    if (
        current_user["role"] == "Teacher"
        and trainer_session
        and trainer_session.get("trainer_id")
        and trainer_session["trainer_id"] != current_user["id"]
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teachers can upload recordings only for their own sessions.",
        )
    duplicate = await recordings_collection.find_one({"session_id": payload.session_id, "is_deleted": {"$ne": True}})
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recording already exists for this session.")


async def ensure_recording_access(recording: dict, current_user: dict, write: bool = False) -> None:
    if current_user["role"] == "Admin":
        return
    if current_user["role"] == "Teacher":
        if write and recording["trainer_id"] != current_user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teachers can manage only their own recordings.")
        return
    if write:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students cannot manage recordings.")
    if recording.get("visibility") == "Private Trainer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recording is private.")
    if current_user["id"].startswith("demo-"):
        return
    if recording.get("batch_id"):
        user_doc = await users_collection.find_one({"_id": ObjectId(current_user["id"])}) if ObjectId.is_valid(current_user["id"]) else None
        allowed_batches = {user_doc.get("batch_id"), user_doc.get("batch_name"), user_doc.get("batch")} if user_doc else set()
        if recording["batch_id"] not in allowed_batches:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recording is not assigned to your batch.")


def safe_upload_name(filename: str) -> str:
    suffix = Path(filename).suffix.lower() or ".mp4"
    return f"{uuid.uuid4().hex}{suffix}"


@router.post("", response_model=RecordingResponse, status_code=status.HTTP_201_CREATED)
async def create_recording(payload: RecordingCreate, current_user: dict = Depends(require_roles("Teacher", "Admin"))) -> RecordingResponse:
    if current_user["role"] == "Teacher" and payload.trainer_id != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trainer ID must match the authenticated user.")
    await validate_recording_references(payload, current_user)
    now = utc_now()
    document = {
        **payload.model_dump(),
        "recording_id": f"REC-{str(ObjectId()).upper()}",
        "recording_date": payload.recording_date or now,
        "playback_count": 0,
        "download_count": 0,
        "viewer_ids": [],
        "total_watch_duration": 0,
        "last_viewed_at": None,
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
        "deleted_at": None,
        "deleted_by": None,
    }
    result = await recordings_collection.insert_one(document)
    created = await recordings_collection.find_one({"_id": result.inserted_id})
    return serialize_recording(created)


@router.post("/upload", response_model=RecordingResponse, status_code=status.HTTP_201_CREATED)
async def upload_recording(
    session_id: str = Form(...),
    batch_id: str = Form(...),
    trainer_id: str = Form(...),
    recording_title: str = Form(...),
    recording_duration: str = Form(...),
    recording_description: str = Form(""),
    visibility: Visibility = Form("Public Batch"),
    video_file: UploadFile = File(...),
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> RecordingResponse:
    if not video_file.content_type or not video_file.content_type.startswith("video/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload a valid video file.")
    original_filename = Path(video_file.filename or "recording.mp4").name
    stored_file_name = safe_upload_name(original_filename)
    stored_path = UPLOAD_DIR / stored_file_name
    payload = RecordingCreate(
        session_id=session_id,
        batch_id=batch_id,
        trainer_id=trainer_id,
        recording_title=recording_title,
        recording_description=recording_description,
        video_file_url=f"/uploads/{stored_file_name}",
        recording_duration=recording_duration,
        file_size=0,
        recording_status="Ready",
        recording_date=utc_now(),
        visibility=visibility,
        mime_type=video_file.content_type,
        original_filename=original_filename,
        processing_error=None,
    )
    await validate_recording_references(payload, current_user)
    try:
        with stored_path.open("wb") as buffer:
            shutil.copyfileobj(video_file.file, buffer)
        payload.file_size = stored_path.stat().st_size
        recording = await create_recording(payload, current_user)
        await recordings_collection.update_one(
            {"recording_id": recording.recording_id},
            {"$set": {"stored_file_name": stored_file_name}},
        )
        return await get_recording(recording.recording_id, current_user)
    except Exception:
        if stored_path.exists() and stored_path.is_file():
            stored_path.unlink()
        raise


@router.get("/analytics/summary", response_model=AnalyticsResponse)
async def recording_analytics(current_user: dict = Depends(require_roles("Teacher", "Admin"))) -> AnalyticsResponse:
    query: dict = {"is_deleted": {"$ne": True}}
    if current_user["role"] == "Teacher":
        query["trainer_id"] = current_user["id"]
    docs = await recordings_collection.find(query).to_list(5000)
    most_viewed = max(docs, key=lambda doc: doc.get("playback_count", 0), default=None)
    return AnalyticsResponse(
        total_recordings=len(docs),
        total_views=sum(int(doc.get("playback_count", 0)) for doc in docs),
        total_downloads=sum(int(doc.get("download_count", 0)) for doc in docs),
        most_viewed_recording=serialize_recording(most_viewed) if most_viewed else None,
    )


@router.get("", response_model=RecordingListResponse)
async def list_recordings(
    search: str | None = None,
    batch_id: str | None = None,
    trainer_id: str | None = None,
    session_id: str | None = None,
    status_filter: RecordingStatus | None = Query(default=None, alias="status"),
    sort: SortOrder = "latest",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> RecordingListResponse:
    query: dict = {"is_deleted": {"$ne": True}}
    if search:
        query["$or"] = [
            {"recording_title": {"$regex": search.strip(), "$options": "i"}},
            {"recording_description": {"$regex": search.strip(), "$options": "i"}},
        ]
    if batch_id:
        query["batch_id"] = batch_id
    if trainer_id:
        query["trainer_id"] = trainer_id
    if session_id:
        query["session_id"] = session_id
    if status_filter:
        query["recording_status"] = status_filter
    if current_user["role"] == "Teacher":
        query["trainer_id"] = current_user["id"]
    elif current_user["role"] not in ("Admin",):
        query["visibility"] = "Public Batch"
        if not current_user["id"].startswith("demo-"):
            user_doc = (
                await users_collection.find_one({"_id": ObjectId(current_user["id"])})
                if ObjectId.is_valid(current_user["id"])
                else None
            )
            allowed_batches = [
                value
                for value in (
                    user_doc.get("batch_id") if user_doc else None,
                    user_doc.get("batch_name") if user_doc else None,
                    user_doc.get("batch") if user_doc else None,
                )
                if value
            ]
            query["batch_id"] = {"$in": allowed_batches}
    skip = (page - 1) * page_size
    total = await recordings_collection.count_documents(query)
    cursor = recordings_collection.find(query).sort("created_at", -1 if sort == "latest" else 1).skip(skip).limit(page_size)
    items = []
    async for document in cursor:
        try:
            await ensure_recording_access(document, current_user)
            items.append(serialize_recording(document))
        except HTTPException:
            total -= 1
    return RecordingListResponse(items=items, total=max(total, 0), page=page, page_size=page_size)


@router.get("/{recording_id}", response_model=RecordingResponse)
async def get_recording(recording_id: str, current_user: dict = Depends(get_current_user)) -> RecordingResponse:
    recording = await get_active_recording(recording_id)
    await ensure_recording_access(recording, current_user)
    return serialize_recording(recording)


@router.put("/{recording_id}", response_model=RecordingResponse)
async def update_recording(recording_id: str, payload: RecordingUpdate, current_user: dict = Depends(require_roles("Teacher", "Admin"))) -> RecordingResponse:
    recording = await get_active_recording(recording_id)
    await ensure_recording_access(recording, current_user, write=True)
    updates = payload.model_dump(exclude_unset=True)
    requested_status = updates.get("recording_status")
    if requested_status and requested_status != recording.get("recording_status"):
        allowed_transitions = {
            "Pending Upload": {"Processing", "Failed"},
            "Processing": {"Encoding Completed", "Failed"},
            "Encoding Completed": {"Ready", "Failed"},
            "Ready": set(),
            "Failed": set(),
        }
        current_status = recording.get("recording_status", "Pending Upload")
        if requested_status not in allowed_transitions.get(current_status, set()):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Invalid recording status transition: {current_status} to {requested_status}.",
            )
    updates["updated_at"] = utc_now()
    await recordings_collection.update_one({"_id": recording["_id"]}, {"$set": updates})
    return await get_recording(recording_id, current_user)


@router.patch("/{recording_id}", response_model=RecordingResponse)
async def patch_recording(recording_id: str, payload: RecordingUpdate, current_user: dict = Depends(require_roles("Teacher", "Admin"))) -> RecordingResponse:
    return await update_recording(recording_id, payload, current_user)


@router.delete("/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recording(
    recording_id: str,
    permanent: bool = False,
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> None:
    recording = await get_active_recording(recording_id)
    await ensure_recording_access(recording, current_user, write=True)
    if permanent:
        if current_user["role"] != "Admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permanent deletion is restricted to administrators.",
            )
        await recordings_collection.delete_one({"_id": recording["_id"]})
        stored_file_name = recording.get("stored_file_name")
        if stored_file_name:
            stored_path = UPLOAD_DIR / stored_file_name
            if stored_path.exists() and stored_path.is_file():
                stored_path.unlink()
        return
    await recordings_collection.update_one(
        {"_id": recording["_id"]},
        {"$set": {"is_deleted": True, "deleted_at": utc_now(), "deleted_by": current_user["id"], "updated_at": utc_now()}},
    )


@router.post("/{recording_id}/playback", response_model=PlaybackResponse)
async def get_playback(recording_id: str, current_user: dict = Depends(get_current_user)) -> PlaybackResponse:
    recording = await get_active_recording(recording_id)
    await ensure_recording_access(recording, current_user)
    if recording.get("recording_status") != "Ready":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recording is not ready for playback.")
    expires_at = utc_now() + timedelta(minutes=30)
    token = secrets.token_urlsafe(24)
    await recordings_collection.update_one(
        {"_id": recording["_id"]},
        {
            "$set": {
                "playback_token": token,
                "playback_token_user_id": current_user["id"],
                "playback_token_expires_at": expires_at,
                "updated_at": utc_now(),
            }
        },
    )
    playback_url = f"/api/recordings/{recording['recording_id']}/stream?token={token}"
    return PlaybackResponse(
        recording_id=recording["recording_id"],
        playback_url=playback_url,
        playback_token=token,
        expires_at=expires_at,
    )


@router.post("/{recording_id}/playback-token", response_model=PlaybackResponse)
async def get_playback_token(recording_id: str, current_user: dict = Depends(get_current_user)) -> PlaybackResponse:
    return await get_playback(recording_id, current_user)


@router.post("/{recording_id}/view", response_model=RecordingResponse)
async def track_view(recording_id: str, payload: ViewTrackRequest, current_user: dict = Depends(get_current_user)) -> RecordingResponse:
    recording = await get_active_recording(recording_id)
    await ensure_recording_access(recording, current_user)
    now = utc_now()
    await recordings_collection.update_one(
        {"_id": recording["_id"]},
        {
            "$inc": {"playback_count": 1, "total_watch_duration": payload.watch_duration_seconds},
            "$addToSet": {"viewer_ids": current_user["id"]},
            "$set": {"last_viewed_at": now, "updated_at": now},
        },
    )
    return await get_recording(recording_id, current_user)


@router.get("/download/{recording_id}")
async def download_recording(recording_id: str, current_user: dict = Depends(get_current_user)) -> FileResponse:
    recording = await get_active_recording(recording_id)
    await ensure_recording_access(recording, current_user)
    if not recording.get("download_enabled", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Downloads are disabled for this recording.")
    stored_file_name = recording.get("stored_file_name")
    if not stored_file_name:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored video file not found.")
    stored_path = UPLOAD_DIR / stored_file_name
    if not stored_path.exists() or not stored_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video file not found.")
    await recordings_collection.update_one({"_id": recording["_id"]}, {"$inc": {"download_count": 1}, "$set": {"updated_at": utc_now()}})
    return FileResponse(
        path=stored_path,
        filename=recording.get("original_filename") or Path(stored_file_name).name,
        media_type=recording.get("mime_type") or "application/octet-stream",
    )


@router.get("/{recording_id}/stream")
async def stream_recording(recording_id: str, request: Request, token: str | None = None):
    recording = await get_active_recording(recording_id)
    if not token or token != recording.get("playback_token"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid playback token.")
    if is_expired(recording.get("playback_token_expires_at")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Playback token expired.")
    if recording.get("recording_status") != "Ready":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recording is not ready for playback.")
    stored_file_name = recording.get("stored_file_name")
    if not stored_file_name:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored video file not found.")
    stored_path = UPLOAD_DIR / stored_file_name
    if not stored_path.exists() or not stored_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video file not found.")
    file_size = stored_path.stat().st_size
    range_header = request.headers.get("range")
    media_type = recording.get("mime_type") or (
        "video/webm" if stored_path.suffix.lower() == ".webm" else "video/mp4"
    )
    headers = {"Accept-Ranges": "bytes"}
    if not range_header:
        return FileResponse(path=stored_path, media_type=media_type, headers=headers)
    try:
        range_value = range_header.replace("bytes=", "")
        start_text, end_text = range_value.split("-", 1)
        start = int(start_text or 0)
        end = int(end_text) if end_text else file_size - 1
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid range header.") from exc
    end = min(end, file_size - 1)
    if start < 0 or start > end:
        raise HTTPException(status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, detail="Invalid range.")
    with stored_path.open("rb") as video:
        video.seek(start)
        data = video.read(end - start + 1)
    headers.update({
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(len(data)),
    })
    return Response(content=data, status_code=status.HTTP_206_PARTIAL_CONTENT, media_type=media_type, headers=headers)
