from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import PyMongoError

from app.authz import get_current_user, require_roles
from app.database import (
    attendance_collection,
    chat_messages_collection,
    managed_sessions_collection,
    trainer_sessions_collection,
)

router = APIRouter(prefix="/chat", tags=["chat"])
MessageType = Literal["Text", "File"]


class ChatSendRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    sender_id: str = Field(..., min_length=1, max_length=120)
    sender_name: str = Field(..., min_length=1, max_length=120)
    message: str = Field(..., min_length=1, max_length=1000)
    message_type: MessageType = "Text"

    @field_validator("session_id", "sender_id", "sender_name", "message")
    @classmethod
    def trim_and_validate(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Value cannot be empty.")
        return cleaned


class ChatMessageResponse(BaseModel):
    id: str
    message_id: str
    session_id: str
    sender_id: str
    sender_name: str
    message: str
    message_type: MessageType
    timestamp: datetime
    date_created: datetime


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_chat_message(document: dict) -> ChatMessageResponse:
    return ChatMessageResponse(
        id=str(document["_id"]),
        message_id=document["message_id"],
        session_id=document["session_id"],
        sender_id=document["sender_id"],
        sender_name=document["sender_name"],
        message=document["message"],
        message_type=document["message_type"],
        timestamp=document["timestamp"],
        date_created=document["date_created"],
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


async def ensure_sender_matches_token(sender_id: str, current_user: dict) -> None:
    if current_user["id"] != sender_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sender ID must match the authenticated user.",
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


@router.post("/send", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    payload: ChatSendRequest,
    current_user: dict = Depends(get_current_user),
) -> ChatMessageResponse:
    await ensure_sender_matches_token(payload.sender_id, current_user)
    await ensure_valid_session(payload.session_id)
    await ensure_session_participant(payload.session_id, current_user)

    now = utc_now()
    document = {
        "message_id": f"MSG-{str(ObjectId()).upper()}",
        "session_id": payload.session_id,
        "sender_id": payload.sender_id,
        "sender_name": payload.sender_name,
        "message": payload.message,
        "message_type": payload.message_type,
        "timestamp": now,
        "date_created": now,
    }

    try:
        result = await chat_messages_collection.insert_one(document)
        created = await chat_messages_collection.find_one({"_id": result.inserted_id})
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save chat message.",
        ) from exc

    return serialize_chat_message(created)


@router.get("/session/{session_id}", response_model=list[ChatMessageResponse])
async def get_session_messages(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> list[ChatMessageResponse]:
    session_id = session_id.strip()
    if not session_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Session ID is required.")

    await ensure_valid_session(session_id)
    await ensure_session_participant(session_id, current_user)

    try:
        cursor = chat_messages_collection.find({"session_id": session_id}).sort("timestamp", 1)
        return [serialize_chat_message(document) async for document in cursor]
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve chat messages.",
        ) from exc


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: str,
    _: dict = Depends(require_roles("Teacher", "Admin")),
) -> None:
    message_id = message_id.strip()
    if not message_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message ID is required.")

    try:
        result = await chat_messages_collection.delete_one({"message_id": message_id})
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete chat message.",
        ) from exc

    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")

