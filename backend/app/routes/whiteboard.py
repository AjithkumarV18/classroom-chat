from datetime import datetime, timezone
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator
from pymongo.errors import PyMongoError

from app.authz import get_current_user, require_roles
from app.database import (
    attendance_collection,
    managed_sessions_collection,
    trainer_sessions_collection,
    whiteboard_entries_collection,
)

router = APIRouter(prefix="/whiteboard", tags=["whiteboard"])
ToolType = Literal["Pen", "Eraser", "Shape", "Text", "Sticky"]


class WhiteboardSaveRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    user_id: str = Field(..., min_length=1, max_length=120)
    drawing_data: dict[str, Any] = Field(...)
    tool_type: ToolType
    color: str | None = Field(default=None, max_length=40)
    stroke_width: int = Field(default=4, ge=1, le=60)

    @field_validator("session_id", "user_id")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Value cannot be empty.")
        return cleaned

    @model_validator(mode="after")
    def validate_drawing_data(self) -> "WhiteboardSaveRequest":
        if not self.drawing_data:
            raise ValueError("Drawing data cannot be empty.")
        return self


class WhiteboardUpdateRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=120)
    drawings: list[WhiteboardSaveRequest] = Field(default_factory=list)

    @field_validator("user_id")
    @classmethod
    def trim_user_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("User ID is required.")
        return cleaned

    @model_validator(mode="after")
    def validate_drawings(self) -> "WhiteboardUpdateRequest":
        if self.drawings is None:
            raise ValueError("Drawings are required.")
        return self


class WhiteboardEntryResponse(BaseModel):
    id: str
    whiteboard_id: str
    session_id: str
    user_id: str
    drawing_data: dict[str, Any]
    tool_type: ToolType
    color: str | None
    stroke_width: int
    timestamp: datetime


class WhiteboardSessionResponse(BaseModel):
    session_id: str
    drawings: list[WhiteboardEntryResponse]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_whiteboard_entry(document: dict) -> WhiteboardEntryResponse:
    return WhiteboardEntryResponse(
        id=str(document["_id"]),
        whiteboard_id=document["whiteboard_id"],
        session_id=document["session_id"],
        user_id=document["user_id"],
        drawing_data=document["drawing_data"],
        tool_type=document["tool_type"],
        color=document.get("color"),
        stroke_width=document.get("stroke_width", 4),
        timestamp=document["timestamp"],
    )


async def session_exists(session_id: str) -> bool:
    managed_session = await managed_sessions_collection.find_one({"session_id": session_id})
    if managed_session:
        return True
    trainer_session = await trainer_sessions_collection.find_one({"room_id": session_id})
    return bool(trainer_session)


async def ensure_valid_session(session_id: str) -> None:
    if not await session_exists(session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid session.")


async def ensure_user_matches_token(user_id: str, current_user: dict) -> None:
    if current_user["id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User ID must match the authenticated user.",
        )


async def ensure_session_participant(session_id: str, current_user: dict) -> None:
    if current_user["role"] in ("Teacher", "Admin"):
        return

    if current_user["role"] == "Student":
        attendance = await attendance_collection.find_one(
            {"session_id": session_id, "user_id": current_user["id"]}
        )
        if attendance:
            return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="User is not a participant in this session.",
    )


def build_document(payload: WhiteboardSaveRequest) -> dict:
    now = utc_now()
    return {
        "whiteboard_id": f"WB-{str(ObjectId()).upper()}",
        "session_id": payload.session_id,
        "user_id": payload.user_id,
        "drawing_data": payload.drawing_data,
        "tool_type": payload.tool_type,
        "color": payload.color,
        "stroke_width": payload.stroke_width,
        "timestamp": now,
    }


@router.post("/save", response_model=WhiteboardEntryResponse, status_code=status.HTTP_201_CREATED)
async def save_whiteboard_drawing(
    payload: WhiteboardSaveRequest,
    current_user: dict = Depends(get_current_user),
) -> WhiteboardEntryResponse:
    await ensure_user_matches_token(payload.user_id, current_user)
    await ensure_valid_session(payload.session_id)
    await ensure_session_participant(payload.session_id, current_user)

    try:
        result = await whiteboard_entries_collection.insert_one(build_document(payload))
        created = await whiteboard_entries_collection.find_one({"_id": result.inserted_id})
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save whiteboard drawing.",
        ) from exc

    return serialize_whiteboard_entry(created)


@router.get("/{session_id}", response_model=WhiteboardSessionResponse)
async def get_whiteboard_drawings(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> WhiteboardSessionResponse:
    session_id = session_id.strip()
    if not session_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Session ID is required.")

    await ensure_valid_session(session_id)
    await ensure_session_participant(session_id, current_user)

    try:
        cursor = whiteboard_entries_collection.find({"session_id": session_id}).sort("timestamp", 1)
        drawings = [serialize_whiteboard_entry(document) async for document in cursor]
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve whiteboard drawings.",
        ) from exc

    return WhiteboardSessionResponse(session_id=session_id, drawings=drawings)


@router.put("/{session_id}", response_model=WhiteboardSessionResponse)
async def update_whiteboard_content(
    session_id: str,
    payload: WhiteboardUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> WhiteboardSessionResponse:
    session_id = session_id.strip()
    if not session_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Session ID is required.")

    await ensure_user_matches_token(payload.user_id, current_user)
    await ensure_valid_session(session_id)
    await ensure_session_participant(session_id, current_user)

    for drawing in payload.drawings:
        if drawing.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="All drawings must belong to the requested session.",
            )
        if drawing.user_id != payload.user_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="All drawings must belong to the request user.",
            )

    try:
        await whiteboard_entries_collection.delete_many({"session_id": session_id})
        if payload.drawings:
            await whiteboard_entries_collection.insert_many([build_document(drawing) for drawing in payload.drawings])
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update whiteboard content.",
        ) from exc

    return await get_whiteboard_drawings(session_id, current_user)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def clear_whiteboard(
    session_id: str,
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> None:
    session_id = session_id.strip()
    if not session_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Session ID is required.")

    await ensure_valid_session(session_id)
    await ensure_session_participant(session_id, current_user)

    try:
        await whiteboard_entries_collection.delete_many({"session_id": session_id})
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to clear whiteboard.",
        ) from exc