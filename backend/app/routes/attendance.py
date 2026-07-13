from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel, Field, model_validator
from pymongo.errors import DuplicateKeyError

from app.authz import require_roles
from app.database import attendance_collection

router = APIRouter(prefix="/attendance", tags=["attendance"])

AttendanceStatus = Literal["Present", "Left", "Absent"]


class AttendanceMarkRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)
    join_time: datetime | None = None
    leave_time: datetime | None = None
    status: AttendanceStatus = "Present"

    @model_validator(mode="after")
    def validate_time_order(self) -> "AttendanceMarkRequest":
        if self.join_time and self.leave_time and self.leave_time < self.join_time:
            raise ValueError("Leave time must be after join time.")
        return self


class AttendanceUpdateRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)
    join_time: datetime | None = None
    leave_time: datetime | None = None
    status: AttendanceStatus | None = None

    @model_validator(mode="after")
    def validate_update(self) -> "AttendanceUpdateRequest":
        if self.join_time is None and self.leave_time is None and self.status is None:
            raise ValueError("Provide join_time, leave_time, or status to update.")
        if self.join_time and self.leave_time and self.leave_time < self.join_time:
            raise ValueError("Leave time must be after join time.")
        return self


class AttendanceResponse(BaseModel):
    id: str
    user_id: str
    session_id: str
    join_time: datetime
    leave_time: datetime | None = None
    duration_seconds: int
    duration_minutes: float
    status: AttendanceStatus
    created_at: datetime
    updated_at: datetime


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_timezone(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def calculate_duration_seconds(join_time: datetime, leave_time: datetime | None) -> int:
    if leave_time is None:
        return 0
    duration = ensure_timezone(leave_time) - ensure_timezone(join_time)
    return max(int(duration.total_seconds()), 0)


def serialize_attendance(document: dict) -> AttendanceResponse:
    duration_seconds = int(document.get("duration_seconds", 0))
    return AttendanceResponse(
        id=str(document["_id"]),
        user_id=document["user_id"],
        session_id=document["session_id"],
        join_time=document["join_time"],
        leave_time=document.get("leave_time"),
        duration_seconds=duration_seconds,
        duration_minutes=round(duration_seconds / 60, 2),
        status=document["status"],
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def require_own_student_record(current_user: dict, user_id: str) -> None:
    if current_user["role"] == "Student" and current_user["id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Students can only access their own attendance records.",
        )


async def get_attendance_record(
    collection: AsyncIOMotorCollection,
    user_id: str,
    session_id: str,
) -> dict | None:
    return await collection.find_one({"user_id": user_id, "session_id": session_id})


@router.post("/mark", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
async def mark_attendance(
    payload: AttendanceMarkRequest,
    current_user: dict = Depends(require_roles("Student", "Teacher", "Admin")),
) -> AttendanceResponse:
    require_own_student_record(current_user, payload.user_id)

    existing = await get_attendance_record(attendance_collection, payload.user_id, payload.session_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance already marked for this user and session.",
        )

    join_time = ensure_timezone(payload.join_time or utc_now())
    leave_time = ensure_timezone(payload.leave_time) if payload.leave_time else None
    now = utc_now()
    document = {
        "user_id": payload.user_id,
        "session_id": payload.session_id,
        "join_time": join_time,
        "leave_time": leave_time,
        "duration_seconds": calculate_duration_seconds(join_time, leave_time),
        "status": payload.status,
        "created_at": now,
        "updated_at": now,
    }

    try:
        result = await attendance_collection.insert_one(document)
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance already marked for this user and session.",
        ) from exc

    created = await attendance_collection.find_one({"_id": result.inserted_id})
    return serialize_attendance(created)


@router.get("/session/{session_id}", response_model=list[AttendanceResponse])
async def get_attendance_by_session(
    session_id: str,
    _: dict = Depends(require_roles("Teacher", "Admin")),
) -> list[AttendanceResponse]:
    cursor = attendance_collection.find({"session_id": session_id}).sort("join_time", -1)
    records = await cursor.to_list(length=500)
    return [serialize_attendance(record) for record in records]


@router.get("/student/{student_id}", response_model=list[AttendanceResponse])
async def get_attendance_by_student(
    student_id: str,
    current_user: dict = Depends(require_roles("Student", "Teacher", "Admin")),
) -> list[AttendanceResponse]:
    require_own_student_record(current_user, student_id)
    cursor = attendance_collection.find({"user_id": student_id}).sort("join_time", -1)
    records = await cursor.to_list(length=500)
    return [serialize_attendance(record) for record in records]


@router.put("/update", response_model=AttendanceResponse)
async def update_attendance(
    payload: AttendanceUpdateRequest,
    _: dict = Depends(require_roles("Teacher", "Admin")),
) -> AttendanceResponse:
    existing = await get_attendance_record(attendance_collection, payload.user_id, payload.session_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found.")

    join_time = ensure_timezone(payload.join_time or existing["join_time"])
    leave_time = payload.leave_time if payload.leave_time is not None else existing.get("leave_time")
    leave_time = ensure_timezone(leave_time) if leave_time else None
    if leave_time and leave_time < join_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Leave time must be after join time.",
        )

    update_data = {
        "join_time": join_time,
        "leave_time": leave_time,
        "duration_seconds": calculate_duration_seconds(join_time, leave_time),
        "updated_at": utc_now(),
    }
    if payload.status:
        update_data["status"] = payload.status
    elif leave_time and existing.get("status") == "Present":
        update_data["status"] = "Left"

    await attendance_collection.update_one(
        {"user_id": payload.user_id, "session_id": payload.session_id},
        {"$set": update_data},
    )
    updated = await get_attendance_record(attendance_collection, payload.user_id, payload.session_id)
    return serialize_attendance(updated)
