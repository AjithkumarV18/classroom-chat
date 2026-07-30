from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.authz import get_current_user, require_roles
from app.database import notification_receipts_collection, notifications_collection, trainer_sessions_collection, users_collection
from app.live.notification_gateway import notification_gateway

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
    trainer_id: str | None = None
    created_at: datetime
    updated_at: datetime


class NotifySessionResponse(BaseModel):
    notification_id: str
    session_id: str
    batch_id: str
    recipient_count: int
    students_notified: bool


def serialize_trainer_session(document: dict) -> TrainerSessionResponse:
    return TrainerSessionResponse(
        id=str(document["_id"]),
        room_id=document["room_id"],
        batch_name=document["batch_name"],
        scheduled_date=document["scheduled_date"],
        scheduled_time=document["scheduled_time"],
        students_notified=document.get("students_notified", False),
        trainer_id=document.get("trainer_id"),
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


async def build_missing_batch_receipts(notification_id: str, batch_name: str, created_at: datetime) -> list[dict]:
    students = await users_collection.find({
        "role": "Student",
        "$or": [{"batch_id": batch_name}, {"batch_name": batch_name}, {"batch": batch_name}],
    }).to_list(2000)
    if not students:
        return []

    student_ids = [str(student["_id"]) for student in students]
    existing_receipts = await notification_receipts_collection.find({
        "notification_id": notification_id,
        "user_id": {"$in": student_ids},
    }).to_list(2000)
    existing_user_ids = {receipt["user_id"] for receipt in existing_receipts}

    return [
        {
            "notification_id": notification_id,
            "user_id": user_id,
            "is_read": False,
            "read_at": None,
            "delivered_at": None,
            "created_at": created_at,
        }
        for user_id in student_ids
        if user_id not in existing_user_ids
    ]


def object_id_or_404(item_id: str) -> ObjectId:
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer session not found.")
    return ObjectId(item_id)


@router.post("", response_model=TrainerSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_trainer_session(
    payload: TrainerSessionCreate,
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> TrainerSessionResponse:
    now = datetime.now(timezone.utc)
    document = {
        **payload.model_dump(),
        "trainer_id": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    result = await trainer_sessions_collection.insert_one(document)
    created = await trainer_sessions_collection.find_one({"_id": result.inserted_id})
    return serialize_trainer_session(created)


@router.get("", response_model=list[TrainerSessionResponse])
async def list_trainer_sessions(current_user: dict = Depends(get_current_user)) -> list[TrainerSessionResponse]:
    query: dict = {}
    if current_user["role"] == "Student":
        user_id = current_user["id"]
        user_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
        user = await users_collection.find_one(user_query)
        batches = {
            value
            for value in (
                user.get("batch_id") if user else None,
                user.get("batch_name") if user else None,
                user.get("batch") if user else None,
            )
            if value
        }
        if not batches:
            return []
        query = {
            "batch_name": {"$in": list(batches)},
            "students_notified": True,
        }
    elif current_user["role"] not in ("Teacher", "Admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this role.")

    cursor = trainer_sessions_collection.find(query).sort("created_at", -1)
    return [serialize_trainer_session(document) async for document in cursor]


@router.get("/{session_id}", response_model=TrainerSessionResponse)
async def get_trainer_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> TrainerSessionResponse:
    document = await trainer_sessions_collection.find_one({"_id": object_id_or_404(session_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer session not found.")
    if current_user["role"] == "Student":
        user_id = current_user["id"]
        user_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
        user = await users_collection.find_one(user_query)
        batches = {
            value
            for value in (
                user.get("batch_id") if user else None,
                user.get("batch_name") if user else None,
                user.get("batch") if user else None,
            )
            if value
        }
        if document.get("batch_name") not in batches or not document.get("students_notified"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This session is not assigned to your batch.")
    elif current_user["role"] not in ("Teacher", "Admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this role.")
    return serialize_trainer_session(document)


@router.put("/{session_id}", response_model=TrainerSessionResponse)
async def update_trainer_session(
    session_id: str,
    payload: TrainerSessionUpdate,
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> TrainerSessionResponse:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_trainer_session(session_id, current_user)

    updates["updated_at"] = datetime.now(timezone.utc)
    result = await trainer_sessions_collection.update_one(
        {"_id": object_id_or_404(session_id)},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer session not found.")
    return await get_trainer_session(session_id, current_user)


@router.post("/{session_id}/notify", response_model=NotifySessionResponse)
async def notify_trainer_session(session_id: str, current_user: dict = Depends(require_roles("Teacher", "Admin"))) -> NotifySessionResponse:
    session_object_id = object_id_or_404(session_id)
    session = await trainer_sessions_collection.find_one({"_id": session_object_id})
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer session not found.")
    if (
        current_user["role"] == "Teacher"
        and session.get("trainer_id")
        and session["trainer_id"] != current_user["id"]
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teachers can notify only their own sessions.",
        )

    now = datetime.now(timezone.utc)
    room_id = session["room_id"]
    batch_name = session["batch_name"]
    existing = await notifications_collection.find_one({
        "session_id": room_id,
        "batch_id": batch_name,
        "notification_type": "LiveClassStarted",
        "is_deleted": {"$ne": True},
    })
    if existing:
        missing_receipts = await build_missing_batch_receipts(existing["notification_id"], batch_name, now)
        if missing_receipts:
            await notification_receipts_collection.insert_many(missing_receipts, ordered=False)
        await trainer_sessions_collection.update_one(
            {"_id": session_object_id},
            {"$set": {"students_notified": True, "updated_at": now}},
        )
        receipt_docs = await notification_receipts_collection.find(
            {"notification_id": existing["notification_id"]}
        ).to_list(2000)
        event = {
            "type": "NEW_NOTIFICATION",
            "payload": {
                "notification_id": existing["notification_id"],
                "session_id": room_id,
                "batch_id": batch_name,
                "title": existing["title"],
                "message": existing["message"],
                "priority": existing["priority"],
                "sender_id": existing["sender_id"],
                "notification_type": existing["notification_type"],
                "created_at": existing["created_at"].isoformat(),
            },
        }
        delivered_user_ids = await notification_gateway.broadcast_to_recipients(
            f"batch_{batch_name}",
            [receipt["user_id"] for receipt in receipt_docs],
            event,
        )
        if delivered_user_ids:
            await notification_receipts_collection.update_many(
                {
                    "notification_id": existing["notification_id"],
                    "user_id": {"$in": list(delivered_user_ids)},
                },
                {"$set": {"delivered_at": now, "updated_at": now}},
            )
        recipient_count = len(receipt_docs)
        return NotifySessionResponse(
            notification_id=existing["notification_id"],
            session_id=room_id,
            batch_id=batch_name,
            recipient_count=recipient_count,
            students_notified=True,
        )

    notification = {
        "notification_id": f"NTF-{str(ObjectId()).upper()}",
        "session_id": room_id,
        "batch_id": batch_name,
        "sender_id": current_user["id"],
        "sender_role": current_user["role"],
        "title": "Live Class Started",
        "message": "Your live class has started. Please join the session.",
        "priority": "High",
        "target_audience": "Batch",
        "notification_type": "LiveClassStarted",
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
        "deleted_at": None,
        "deleted_by": None,
    }
    await notifications_collection.insert_one(notification)
    receipts = await build_missing_batch_receipts(notification["notification_id"], batch_name, now)
    if receipts:
        await notification_receipts_collection.insert_many(receipts, ordered=False)
    await trainer_sessions_collection.update_one(
        {"_id": session_object_id},
        {"$set": {"students_notified": True, "updated_at": now}},
    )
    event = {
        "type": "NEW_NOTIFICATION",
        "payload": {
            "notification_id": notification["notification_id"],
            "session_id": room_id,
            "batch_id": batch_name,
            "title": notification["title"],
            "message": notification["message"],
            "priority": notification["priority"],
            "sender_id": current_user["id"],
            "notification_type": notification["notification_type"],
            "created_at": now.isoformat(),
        },
    }
    recipient_user_ids = [receipt["user_id"] for receipt in receipts]
    delivered_user_ids = await notification_gateway.broadcast_to_recipients(
        f"batch_{batch_name}",
        recipient_user_ids,
        event,
    )
    if delivered_user_ids:
        await notification_receipts_collection.update_many(
            {
                "notification_id": notification["notification_id"],
                "user_id": {"$in": list(delivered_user_ids)},
            },
            {"$set": {"delivered_at": now, "updated_at": now}},
        )
    return NotifySessionResponse(
        notification_id=notification["notification_id"],
        session_id=room_id,
        batch_id=batch_name,
        recipient_count=len(receipts),
        students_notified=True,
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trainer_session(
    session_id: str,
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> None:
    result = await trainer_sessions_collection.delete_one({"_id": object_id_or_404(session_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trainer session not found.")


