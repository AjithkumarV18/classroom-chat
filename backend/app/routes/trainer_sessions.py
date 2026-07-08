from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.database import trainer_sessions_collection

router = APIRouter(prefix="/trainer-sessions", tags=["trainer sessions"])


class TrainerSessionCreate(BaseModel):
    room_id: str = Field(..., min_length=1, max_length=80)
    batch_name: str = Field(..., min_length=1, max_length=120)
    scheduled_date: str = Field(..., min_length=1)
    scheduled_time: str = Field(..., min_length=1)
    students_notified: bool = False


class TrainerSessionUpdate(BaseModel):
    room_id: str | None = Field(default=None, min_length=1, max_length=80)
    batch_name: str | None = Field(default=None, min_length=1, max_length=120)
    scheduled_date: str | None = Field(default=None, min_length=1)
    scheduled_time: str | None = Field(default=None, min_length=1)
    students_notified: bool | None = None


class TrainerSessionResponse(BaseModel):
    id: str
    room_id: str
    batch_name: str
    scheduled_date: str
    scheduled_time: str
    students_notified: bool
    created_at: datetime
    updated_at: datetime


def serialize_trainer_session(document: dict) -> TrainerSessionResponse:
    return TrainerSessionResponse(
        id=str(document["_id"]),
        room_id=document["room_id"],
        batch_name=document["batch_name"],
        scheduled_date=document["scheduled_date"],
        scheduled_time=document["scheduled_time"],
        students_notified=document.get("students_notified", False),
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def object_id_or_404(item_id: str) -> ObjectId:
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer session not found.")
    return ObjectId(item_id)


@router.post("", response_model=TrainerSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_trainer_session(payload: TrainerSessionCreate) -> TrainerSessionResponse:
    now = datetime.now(timezone.utc)
    document = {
        **payload.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    result = await trainer_sessions_collection.insert_one(document)
    created = await trainer_sessions_collection.find_one({"_id": result.inserted_id})
    return serialize_trainer_session(created)


@router.get("", response_model=list[TrainerSessionResponse])
async def list_trainer_sessions() -> list[TrainerSessionResponse]:
    cursor = trainer_sessions_collection.find().sort("created_at", -1)
    return [serialize_trainer_session(document) async for document in cursor]


@router.get("/{session_id}", response_model=TrainerSessionResponse)
async def get_trainer_session(session_id: str) -> TrainerSessionResponse:
    document = await trainer_sessions_collection.find_one({"_id": object_id_or_404(session_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer session not found.")
    return serialize_trainer_session(document)


@router.put("/{session_id}", response_model=TrainerSessionResponse)
async def update_trainer_session(session_id: str, payload: TrainerSessionUpdate) -> TrainerSessionResponse:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_trainer_session(session_id)

    updates["updated_at"] = datetime.now(timezone.utc)
    result = await trainer_sessions_collection.update_one(
        {"_id": object_id_or_404(session_id)},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer session not found.")
    return await get_trainer_session(session_id)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trainer_session(session_id: str) -> None:
    result = await trainer_sessions_collection.delete_one({"_id": object_id_or_404(session_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer session not found.")
