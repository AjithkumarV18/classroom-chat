from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.authz import require_roles
from app.database import managed_sessions_collection

router = APIRouter(prefix="/managed-sessions", tags=["managed sessions"], dependencies=[Depends(require_roles("Teacher", "Admin"))])
SessionStatus = Literal["Upcoming", "Live", "Completed"]


class ManagedSessionCreate(BaseModel):
    session_name: str = Field(..., min_length=1, max_length=160)
    trainer_name: str = Field(..., min_length=1, max_length=120)
    date: str = Field(..., min_length=1)
    time: str = Field(..., min_length=1)
    duration: str = Field(..., min_length=1, max_length=60)
    description: str = Field(..., min_length=1, max_length=600)
    status: SessionStatus = "Upcoming"


class ManagedSessionUpdate(BaseModel):
    session_name: str | None = Field(default=None, min_length=1, max_length=160)
    trainer_name: str | None = Field(default=None, min_length=1, max_length=120)
    date: str | None = Field(default=None, min_length=1)
    time: str | None = Field(default=None, min_length=1)
    duration: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, min_length=1, max_length=600)
    status: SessionStatus | None = None


class ManagedSessionResponse(BaseModel):
    id: str
    session_id: str
    session_name: str
    trainer_name: str
    date: str
    time: str
    duration: str
    description: str
    status: SessionStatus
    created_at: datetime
    updated_at: datetime


def serialize_session(document: dict) -> ManagedSessionResponse:
    return ManagedSessionResponse(
        id=str(document["_id"]),
        session_id=document["session_id"],
        session_name=document["session_name"],
        trainer_name=document["trainer_name"],
        date=document["date"],
        time=document["time"],
        duration=document["duration"],
        description=document["description"],
        status=document["status"],
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def object_id_or_404(item_id: str) -> ObjectId:
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return ObjectId(item_id)


def generate_session_id() -> str:
    return f"SES-{ObjectId().generation_time.strftime('%y%m%d')}-{str(ObjectId())[-6:].upper()}"


@router.post("", response_model=ManagedSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(payload: ManagedSessionCreate) -> ManagedSessionResponse:
    now = datetime.now(timezone.utc)
    document = {
        **payload.model_dump(),
        "session_id": generate_session_id(),
        "created_at": now,
        "updated_at": now,
    }
    result = await managed_sessions_collection.insert_one(document)
    created = await managed_sessions_collection.find_one({"_id": result.inserted_id})
    return serialize_session(created)


@router.get("", response_model=list[ManagedSessionResponse])
async def list_sessions() -> list[ManagedSessionResponse]:
    cursor = managed_sessions_collection.find().sort("created_at", -1)
    return [serialize_session(document) async for document in cursor]


@router.get("/{session_object_id}", response_model=ManagedSessionResponse)
async def get_session(session_object_id: str) -> ManagedSessionResponse:
    document = await managed_sessions_collection.find_one({"_id": object_id_or_404(session_object_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return serialize_session(document)


@router.put("/{session_object_id}", response_model=ManagedSessionResponse)
async def update_session(session_object_id: str, payload: ManagedSessionUpdate) -> ManagedSessionResponse:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_session(session_object_id)

    updates["updated_at"] = datetime.now(timezone.utc)
    result = await managed_sessions_collection.update_one(
        {"_id": object_id_or_404(session_object_id)},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return await get_session(session_object_id)


@router.delete("/{session_object_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_object_id: str) -> None:
    result = await managed_sessions_collection.delete_one({"_id": object_id_or_404(session_object_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")


