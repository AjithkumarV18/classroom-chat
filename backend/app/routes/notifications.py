from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from pymongo.errors import PyMongoError

from app.authz import get_current_user, require_roles
from app.database import notifications_collection, users_collection

router = APIRouter(prefix="/notifications", tags=["notifications"])

RecipientType = Literal["All", "Batch", "User"]
Priority = Literal["Low", "Medium", "High"]
NotificationStatus = Literal["Active", "Draft", "Sent", "Deleted"]


class NotificationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    message: str = Field(..., min_length=1, max_length=1200)
    recipient_type: RecipientType = "All"
    recipient_id: str | None = Field(default=None, max_length=120)
    batch_id: str | None = Field(default=None, max_length=120)
    priority: Priority = "Medium"
    notification_status: NotificationStatus = "Sent"

    @model_validator(mode="after")
    def validate_recipient(self) -> "NotificationCreate":
        self.title = self.title.strip()
        self.message = self.message.strip()
        if not self.title or not self.message:
            raise ValueError("Title and message are required.")
        if self.recipient_type == "User" and not (self.recipient_id or "").strip():
            raise ValueError("Recipient ID is required for user notifications.")
        if self.recipient_type == "Batch" and not (self.batch_id or self.recipient_id or "").strip():
            raise ValueError("Batch ID is required for batch notifications.")
        if self.recipient_type == "All":
            self.recipient_id = None
            self.batch_id = None
        if self.recipient_id:
            self.recipient_id = self.recipient_id.strip()
        if self.batch_id:
            self.batch_id = self.batch_id.strip()
        return self


class NotificationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    message: str | None = Field(default=None, min_length=1, max_length=1200)
    recipient_type: RecipientType | None = None
    recipient_id: str | None = Field(default=None, max_length=120)
    batch_id: str | None = Field(default=None, max_length=120)
    priority: Priority | None = None
    notification_status: NotificationStatus | None = None

    @model_validator(mode="after")
    def validate_update(self) -> "NotificationUpdate":
        updates = self.model_dump(exclude_unset=True)
        if not updates:
            raise ValueError("Provide at least one field to update.")
        if self.title is not None:
            self.title = self.title.strip()
        if self.message is not None:
            self.message = self.message.strip()
        if self.title == "" or self.message == "":
            raise ValueError("Title and message cannot be empty.")
        if self.recipient_id:
            self.recipient_id = self.recipient_id.strip()
        if self.batch_id:
            self.batch_id = self.batch_id.strip()
        return self


class NotificationResponse(BaseModel):
    id: str
    notification_id: str
    title: str
    message: str
    sender_id: str
    sender_role: str
    recipient_type: RecipientType
    recipient_id: str | None = None
    batch_id: str | None = None
    priority: Priority
    read_status: bool
    notification_status: NotificationStatus
    created_at: datetime
    updated_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def object_id_or_404(notification_object_id: str) -> ObjectId:
    if not ObjectId.is_valid(notification_object_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    return ObjectId(notification_object_id)


def serialize_notification(document: dict, current_user: dict | None = None) -> NotificationResponse:
    read_by = document.get("read_by", [])
    read_status = document.get("read_status", False)
    if current_user:
        read_status = current_user["id"] in read_by or read_status

    return NotificationResponse(
        id=str(document["_id"]),
        notification_id=document["notification_id"],
        title=document["title"],
        message=document["message"],
        sender_id=document["sender_id"],
        sender_role=document["sender_role"],
        recipient_type=document["recipient_type"],
        recipient_id=document.get("recipient_id"),
        batch_id=document.get("batch_id"),
        priority=document["priority"],
        read_status=read_status,
        notification_status=document["notification_status"],
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def build_filter(
    search: str | None,
    priority: str | None,
    recipient_type: str | None,
    notification_status: str | None,
    start_date: datetime | None,
    end_date: datetime | None,
) -> dict:
    query: dict = {"notification_status": {"$ne": "Deleted"}}
    if search:
        query["$or"] = [
            {"title": {"$regex": search.strip(), "$options": "i"}},
            {"message": {"$regex": search.strip(), "$options": "i"}},
        ]
    if priority:
        query["priority"] = priority
    if recipient_type:
        query["recipient_type"] = recipient_type
    if notification_status:
        query["notification_status"] = notification_status
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        query["created_at"] = date_filter
    return query


async def validate_recipient(payload: NotificationCreate | NotificationUpdate) -> None:
    recipient_type = getattr(payload, "recipient_type", None)
    recipient_id = getattr(payload, "recipient_id", None)
    if recipient_type == "User" and recipient_id:
        user = None
        if ObjectId.is_valid(recipient_id):
            user = await users_collection.find_one({"_id": ObjectId(recipient_id)})
        if not user and not recipient_id.startswith("demo-"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient user not found.")


async def get_active_notification(notification_id: str) -> dict:
    document = await notifications_collection.find_one(
        {"_id": object_id_or_404(notification_id), "notification_status": {"$ne": "Deleted"}}
    )
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    return document


def user_notification_filter(current_user: dict) -> dict:
    return {
        "notification_status": {"$ne": "Deleted"},
        "$or": [
            {"recipient_type": "All"},
            {"recipient_type": "User", "recipient_id": current_user["id"]},
            {"recipient_type": "Batch", "recipient_id": current_user["id"]},
        ],
    }


@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def create_notification(
    payload: NotificationCreate,
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> NotificationResponse:
    await validate_recipient(payload)
    now = utc_now()
    document = {
        **payload.model_dump(),
        "notification_id": f"NTF-{str(ObjectId()).upper()}",
        "sender_id": current_user["id"],
        "sender_role": current_user["role"],
        "read_status": False,
        "read_by": [],
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = await notifications_collection.insert_one(document)
        created = await notifications_collection.find_one({"_id": result.inserted_id})
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Unable to create notification.") from exc
    return serialize_notification(created, current_user)


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    search: str | None = None,
    priority: Priority | None = None,
    recipient_type: RecipientType | None = None,
    status_filter: NotificationStatus | None = Query(default=None, alias="status"),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> NotificationListResponse:
    query = build_filter(search, priority, recipient_type, status_filter, start_date, end_date)
    skip = (page - 1) * page_size
    try:
        total = await notifications_collection.count_documents(query)
        cursor = notifications_collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [serialize_notification(document, current_user) async for document in cursor]
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Unable to load notifications.") from exc
    return NotificationListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/my", response_model=NotificationListResponse)
async def list_my_notifications(
    search: str | None = None,
    priority: Priority | None = None,
    read_status: bool | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> NotificationListResponse:
    query = user_notification_filter(current_user)
    extra = build_filter(search, priority, None, None, start_date, end_date)
    for key, value in extra.items():
        if key != "notification_status":
            query[key] = value
    if read_status is True:
        query["read_by"] = current_user["id"]
    elif read_status is False:
        query["read_by"] = {"$ne": current_user["id"]}
    skip = (page - 1) * page_size
    try:
        total = await notifications_collection.count_documents(query)
        cursor = notifications_collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [serialize_notification(document, current_user) async for document in cursor]
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Unable to load notifications.") from exc
    return NotificationListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification_details(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
) -> NotificationResponse:
    document = await get_active_notification(notification_id)
    if current_user["role"] not in ("Teacher", "Admin"):
        allowed = document["recipient_type"] == "All" or document.get("recipient_id") == current_user["id"]
        if not allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied for this notification.")
    return serialize_notification(document, current_user)


@router.put("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
) -> NotificationResponse:
    await get_notification_details(notification_id, current_user)
    try:
        await notifications_collection.update_one(
            {"_id": object_id_or_404(notification_id)},
            {"$addToSet": {"read_by": current_user["id"]}, "$set": {"updated_at": utc_now()}},
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Unable to mark notification as read.") from exc
    updated = await get_active_notification(notification_id)
    return serialize_notification(updated, current_user)


@router.put("/{notification_id}", response_model=NotificationResponse)
async def update_notification(
    notification_id: str,
    payload: NotificationUpdate,
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> NotificationResponse:
    existing = await get_active_notification(notification_id)
    if current_user["role"] == "Teacher" and existing["sender_id"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teachers can edit only their own notifications.")
    await validate_recipient(payload)
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = utc_now()
    try:
        await notifications_collection.update_one({"_id": existing["_id"]}, {"$set": updates})
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Unable to update notification.") from exc
    updated = await get_active_notification(notification_id)
    return serialize_notification(updated, current_user)


@router.delete("/{notification_id}", response_model=NotificationResponse)
async def soft_delete_notification(
    notification_id: str,
    current_user: dict = Depends(require_roles("Admin")),
) -> NotificationResponse:
    existing = await get_active_notification(notification_id)
    try:
        await notifications_collection.update_one(
            {"_id": existing["_id"]},
            {"$set": {"notification_status": "Deleted", "updated_at": utc_now()}},
        )
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Unable to delete notification.") from exc
    existing["notification_status"] = "Deleted"
    existing["updated_at"] = utc_now()
    return serialize_notification(existing, current_user)