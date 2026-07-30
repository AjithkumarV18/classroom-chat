from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field, model_validator
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.authz import get_current_user, require_roles
from app.database import (
    live_participants_collection,
    managed_sessions_collection,
    notification_receipts_collection,
    notifications_collection,
    trainer_sessions_collection,
    users_collection,
)
from app.live.helpers import decode_ws_token, session_exists
from app.live.notification_gateway import notification_gateway

router = APIRouter(prefix="/notifications", tags=["notifications"])

Priority = Literal["Low", "Medium", "High", "Emergency"]
TargetAudience = Literal["All", "Batch", "LiveClassroom"]
SortOrder = Literal["newest", "oldest"]


class NotificationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    message: str = Field(..., min_length=1, max_length=1200)
    priority: Priority
    target_audience: TargetAudience
    batch_id: str | None = Field(default=None, max_length=120)
    session_id: str | None = Field(default=None, max_length=120)
    notification_type: str = Field(default="General", max_length=80)

    @model_validator(mode="after")
    def validate_target(self) -> "NotificationCreate":
        self.title = self.title.strip()
        self.message = self.message.strip()
        self.batch_id = self.batch_id.strip() if self.batch_id else None
        self.session_id = self.session_id.strip() if self.session_id else None
        if not self.title:
            raise ValueError("Title is required.")
        if not self.message:
            raise ValueError("Message is required.")
        if self.target_audience == "All" and (self.batch_id or self.session_id):
            raise ValueError("Batch ID and Session ID are not allowed for All notifications.")
        if self.target_audience == "Batch":
            if not self.batch_id:
                raise ValueError("Batch ID is required for Batch notifications.")
        if self.target_audience == "LiveClassroom":
            if not self.session_id:
                raise ValueError("Session ID is required for LiveClassroom notifications.")
            if self.batch_id:
                raise ValueError("Batch ID is not allowed for LiveClassroom notifications.")
        return self


class NotificationResponse(BaseModel):
    id: str
    notification_id: str
    session_id: str | None = None
    batch_id: str | None = None
    sender_id: str
    sender_role: str
    title: str
    message: str
    priority: Priority
    target_audience: TargetAudience
    notification_type: str = "General"
    is_read: bool = False
    read_at: datetime | None = None
    created_at: datetime
    is_deleted: bool = False


class NotificationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    message: str | None = Field(default=None, min_length=1, max_length=1200)
    priority: Priority | None = None

    @model_validator(mode="after")
    def validate_update(self) -> "NotificationUpdate":
        updates = self.model_dump(exclude_unset=True)
        if not updates:
            raise ValueError("Provide at least one field to update.")
        if self.title is not None:
            self.title = self.title.strip()
            if not self.title:
                raise ValueError("Title is required.")
        if self.message is not None:
            self.message = self.message.strip()
            if not self.message:
                raise ValueError("Message is required.")
        return self


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def notification_id_query(identifier: str) -> dict:
    return {"_id": ObjectId(identifier)} if ObjectId.is_valid(identifier) else {"notification_id": identifier}


async def batch_exists(batch_id: str) -> bool:
    if ObjectId.is_valid(batch_id) and await trainer_sessions_collection.find_one({"_id": ObjectId(batch_id)}):
        return True
    return bool(await trainer_sessions_collection.find_one({"batch_name": batch_id}))


async def validate_target(payload: NotificationCreate, current_user: dict) -> None:
    if current_user["role"] == "Teacher" and payload.target_audience == "All":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can send platform-wide notifications.",
        )
    session = None
    if payload.session_id:
        session = await trainer_sessions_collection.find_one({"room_id": payload.session_id})
        if not session and not await session_exists(payload.session_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live session not found.")

    batch_sessions: list[dict] = []
    if payload.batch_id:
        batch_sessions = await trainer_sessions_collection.find(
            {"batch_name": payload.batch_id}
        ).to_list(500)
        if not batch_sessions and not await batch_exists(payload.batch_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

    if session and payload.batch_id and session.get("batch_name") != payload.batch_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Session is not assigned to the selected batch.",
        )

    if current_user["role"] == "Teacher":
        target_sessions = [session] if session else batch_sessions
        has_owned_session = any(
            item and item.get("trainer_id") == current_user["id"]
            for item in target_sessions
        )
        has_legacy_session = any(
            item and not item.get("trainer_id")
            for item in target_sessions
        )
        if target_sessions and not has_owned_session and not has_legacy_session:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teachers can notify only their own sessions or batches.",
            )


def serialize_notification(document: dict, receipt: dict | None = None) -> NotificationResponse:
    recipient_type = document.get("target_audience") or document.get("recipient_type") or "All"
    audience_map = {
        "all": "All",
        "batch": "Batch",
        "liveclassroom": "LiveClassroom",
        "live_classroom": "LiveClassroom",
        "classroom": "LiveClassroom",
    }
    recipient_type = audience_map.get(str(recipient_type).strip().lower(), recipient_type)
    if recipient_type == "User":
        recipient_type = "All"
    priority = document.get("priority") or "Medium"
    priority_map = {
        "low": "Low",
        "medium": "Medium",
        "high": "High",
        "emergency": "Emergency",
    }
    priority = priority_map.get(str(priority).strip().lower(), priority)
    if priority not in ("Low", "Medium", "High", "Emergency"):
        priority = "Medium"
    return NotificationResponse(
        id=str(document["_id"]),
        notification_id=document.get("notification_id") or str(document["_id"]),
        session_id=document.get("session_id"),
        batch_id=document.get("batch_id"),
        sender_id=document.get("sender_id", "system"),
        sender_role=document.get("sender_role", "Admin"),
        title=document.get("title", "Notification"),
        message=document.get("message", ""),
        priority=priority,
        target_audience=recipient_type,
        notification_type=document.get("notification_type", "General"),
        is_read=bool(receipt and receipt.get("is_read")) or bool(document.get("read_status")),
        read_at=receipt.get("read_at") if receipt else None,
        created_at=document.get("created_at") or document.get("updated_at") or utc_now(),
        is_deleted=document.get("is_deleted", False),
    )


async def get_recipient_user_ids(payload: NotificationCreate) -> list[str]:
    if payload.target_audience == "LiveClassroom":
        docs = await live_participants_collection.find(
            {"session_id": payload.session_id, "role": {"$nin": ["Teacher", "Admin"]}, "status": {"$ne": "removed"}}
        ).to_list(1000)
        return sorted({doc["user_id"] for doc in docs})

    query: dict = {"role": "Student"}
    if payload.target_audience == "Batch":
        query["$or"] = [
            {"batch_id": payload.batch_id},
            {"batch_name": payload.batch_id},
            {"batch": payload.batch_id},
        ]
    users = await users_collection.find(query).to_list(2000)
    return [str(user["_id"]) for user in users]


def channel_for(payload: NotificationCreate | dict) -> str:
    target = payload.target_audience if isinstance(payload, NotificationCreate) else payload.get("target_audience")
    if target == "Batch":
        batch_id = payload.batch_id if isinstance(payload, NotificationCreate) else payload.get("batch_id")
        return f"batch_{batch_id}"
    if target == "LiveClassroom":
        session_id = payload.session_id if isinstance(payload, NotificationCreate) else payload.get("session_id")
        return f"classroom_{session_id}"
    return "all"


async def assigned_receipt(notification_id: str, user_id: str) -> dict:
    receipt = await notification_receipts_collection.find_one({"notification_id": notification_id, "user_id": user_id})
    if not receipt:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Notification is not assigned to this user.")
    return receipt


@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def create_notification(
    payload: NotificationCreate,
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> NotificationResponse:
    await validate_target(payload, current_user)
    now = utc_now()
    document = {
        "notification_id": f"NTF-{str(ObjectId()).upper()}",
        "session_id": payload.session_id,
        "batch_id": payload.batch_id,
        "sender_id": current_user["id"],
        "sender_role": current_user["role"],
        "title": payload.title,
        "message": payload.message,
        "priority": payload.priority,
        "target_audience": payload.target_audience,
        "notification_type": payload.notification_type,
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
        "deleted_at": None,
        "deleted_by": None,
    }
    try:
        result = await notifications_collection.insert_one(document)
        created = await notifications_collection.find_one({"_id": result.inserted_id})
        recipient_user_ids = await get_recipient_user_ids(payload)
        receipt_docs = [
            {
                "notification_id": created["notification_id"],
                "user_id": user_id,
                "is_read": False,
                "read_at": None,
                "delivered_at": None,
                "created_at": now,
                "updated_at": now,
            }
            for user_id in recipient_user_ids
        ]
        if receipt_docs:
            await notification_receipts_collection.insert_many(receipt_docs, ordered=False)
    except DuplicateKeyError:
        pass
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Unable to create notification.") from exc

    response = serialize_notification(created)
    event = {"type": "NEW_NOTIFICATION", "payload": response.model_dump(mode="json")}
    delivered_user_ids = await notification_gateway.broadcast_to_recipients(
        channel_for(payload),
        recipient_user_ids,
        event,
    )
    if delivered_user_ids:
        await notification_receipts_collection.update_many(
            {
                "notification_id": created["notification_id"],
                "user_id": {"$in": list(delivered_user_ids)},
            },
            {"$set": {"delivered_at": now, "updated_at": now}},
        )
    return response


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = False,
    read_status: bool | None = None,
    search: str | None = None,
    priority: Priority | None = None,
    recipient_type: TargetAudience | None = None,
    session_id: str | None = None,
    batch_id: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort: SortOrder = "newest",
    current_user: dict = Depends(get_current_user),
) -> NotificationListResponse:
    skip = (page - 1) * page_size
    sort_dir = -1 if sort == "newest" else 1

    if current_user["role"] in ("Teacher", "Admin"):
        query: dict = {"is_deleted": {"$ne": True}}
        if current_user["role"] == "Teacher":
            query["sender_id"] = current_user["id"]
        if unread_only:
            query["_id"] = {"$exists": False}
        if read_status is not None:
            query["_id"] = {"$exists": False} if not read_status else {"$exists": True}
        if search and search.strip():
            query["$or"] = [
                {"title": {"$regex": search.strip(), "$options": "i"}},
                {"message": {"$regex": search.strip(), "$options": "i"}},
            ]
        if priority:
            query["priority"] = priority
        if recipient_type:
            query["target_audience"] = recipient_type
        if session_id:
            query["session_id"] = session_id
        if batch_id:
            query["batch_id"] = batch_id
        if start_date or end_date:
            query["created_at"] = {}
            if start_date:
                query["created_at"]["$gte"] = start_date
            if end_date:
                query["created_at"]["$lte"] = end_date
        total = await notifications_collection.count_documents(query)
        cursor = notifications_collection.find(query).sort("created_at", sort_dir).skip(skip).limit(page_size)
        return NotificationListResponse(
            items=[serialize_notification(document) async for document in cursor],
            total=total,
            page=page,
            page_size=page_size,
        )

    receipt_query = {"user_id": current_user["id"]}
    if unread_only or read_status is False:
        receipt_query["is_read"] = False
    elif read_status is True:
        receipt_query["is_read"] = True
    receipts = await notification_receipts_collection.find(receipt_query).to_list(5000)
    receipt_map = {receipt["notification_id"]: receipt for receipt in receipts}
    ids = list(receipt_map)
    query = {"notification_id": {"$in": ids}, "is_deleted": {"$ne": True}}
    if search and search.strip():
        query["$or"] = [
            {"title": {"$regex": search.strip(), "$options": "i"}},
            {"message": {"$regex": search.strip(), "$options": "i"}},
        ]
    if priority:
        query["priority"] = priority
    if recipient_type:
        query["target_audience"] = recipient_type
    if session_id:
        query["session_id"] = session_id
    if batch_id:
        query["batch_id"] = batch_id
    if start_date or end_date:
        query["created_at"] = {}
        if start_date:
            query["created_at"]["$gte"] = start_date
        if end_date:
            query["created_at"]["$lte"] = end_date
    total = await notifications_collection.count_documents(query)
    cursor = notifications_collection.find(query).sort("created_at", sort_dir).skip(skip).limit(page_size)
    return NotificationListResponse(
        items=[serialize_notification(document, receipt_map.get(document["notification_id"])) async for document in cursor],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/my", response_model=NotificationListResponse)
async def list_my_notifications(
    unread_only: bool = False,
    read_status: bool | None = None,
    search: str | None = None,
    priority: Priority | None = None,
    recipient_type: TargetAudience | None = None,
    session_id: str | None = None,
    batch_id: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort: SortOrder = "newest",
    current_user: dict = Depends(get_current_user),
) -> NotificationListResponse:
    return await list_notifications(
        unread_only=unread_only,
        read_status=read_status,
        search=search,
        priority=priority,
        recipient_type=recipient_type,
        session_id=session_id,
        batch_id=batch_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
        sort=sort,
        current_user=current_user,
    )


@router.get("/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)) -> dict[str, int]:
    if current_user["role"] in ("Teacher", "Admin"):
        return {"unread_count": 0}
    count = await notification_receipts_collection.count_documents({"user_id": current_user["id"], "is_read": False})
    return {"unread_count": count}


@router.patch("/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)) -> dict[str, int]:
    now = utc_now()
    result = await notification_receipts_collection.update_many(
        {"user_id": current_user["id"], "is_read": False},
        {"$set": {"is_read": True, "read_at": now, "updated_at": now}},
    )
    return {"updated_count": result.modified_count}


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(notification_id: str, current_user: dict = Depends(get_current_user)) -> NotificationResponse:
    document = await notifications_collection.find_one({**notification_id_query(notification_id), "is_deleted": {"$ne": True}})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    receipt = None
    if current_user["role"] not in ("Teacher", "Admin"):
        receipt = await assigned_receipt(document["notification_id"], current_user["id"])
    return serialize_notification(document, receipt)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)) -> NotificationResponse:
    document = await notifications_collection.find_one({**notification_id_query(notification_id), "is_deleted": {"$ne": True}})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    receipt = await assigned_receipt(document["notification_id"], current_user["id"])
    now = utc_now()
    await notification_receipts_collection.update_one(
        {"_id": receipt["_id"]},
        {"$set": {"is_read": True, "read_at": now, "updated_at": now}},
    )
    receipt["is_read"] = True
    receipt["read_at"] = now
    return serialize_notification(document, receipt)


@router.put("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read_compat(notification_id: str, current_user: dict = Depends(get_current_user)) -> NotificationResponse:
    return await mark_notification_read(notification_id, current_user)


@router.put("/{notification_id}", response_model=NotificationResponse)
async def update_notification(
    notification_id: str,
    payload: NotificationUpdate,
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> NotificationResponse:
    document = await notifications_collection.find_one(
        {**notification_id_query(notification_id), "is_deleted": {"$ne": True}}
    )
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    if current_user["role"] == "Teacher" and document["sender_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teachers can update only their own notifications.",
        )
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = utc_now()
    await notifications_collection.update_one(
        {"_id": document["_id"]},
        {"$set": updates},
    )
    updated = await notifications_collection.find_one({"_id": document["_id"]})
    return serialize_notification(updated)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(notification_id: str, current_user: dict = Depends(require_roles("Teacher", "Admin"))) -> None:
    document = await notifications_collection.find_one({**notification_id_query(notification_id), "is_deleted": {"$ne": True}})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    if current_user["role"] == "Teacher" and document["sender_id"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teachers can delete only their own notifications.")
    await notifications_collection.update_one(
        {"_id": document["_id"]},
        {"$set": {"is_deleted": True, "deleted_at": utc_now(), "deleted_by": current_user["id"]}},
    )


@router.websocket("/ws")
async def notification_ws(websocket: WebSocket, token: str = Query(...), channel: str = Query("all")):
    user = decode_ws_token(token)
    if channel != "all":
        if channel.startswith("user_"):
            if channel.removeprefix("user_") != user["id"]:
                await websocket.close(code=4403)
                return
        elif channel.startswith("batch_") and user["role"] not in ("Teacher", "Admin"):
            batch_id = channel.removeprefix("batch_")
            user_doc = await users_collection.find_one({"_id": ObjectId(user["id"])}) if ObjectId.is_valid(user["id"]) else None
            if not user_doc or batch_id not in {user_doc.get("batch_id"), user_doc.get("batch_name"), user_doc.get("batch")}:
                await websocket.close(code=4403)
                return
        elif channel.startswith("classroom_"):
            session_id = channel.removeprefix("classroom_")
            participant = await live_participants_collection.find_one({"session_id": session_id, "user_id": user["id"]})
            if user["role"] not in ("Teacher", "Admin") and not participant:
                await websocket.close(code=4403)
                return
        else:
            await websocket.close(code=4400)
            return

    await notification_gateway.connect(channel, user["id"], websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        notification_gateway.disconnect(channel, user["id"])
