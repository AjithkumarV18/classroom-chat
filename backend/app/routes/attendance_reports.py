import csv
import io
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.authz import get_current_user, require_roles
from app.database import (
    attendance_collection,
    managed_sessions_collection,
    trainer_sessions_collection,
    users_collection,
)

router = APIRouter(prefix="/attendance", tags=["attendance reports"])

PRESENT_STATUSES = {"Present", "Left"}


class SessionBreakdownItem(BaseModel):
    session_id: str
    session_name: str
    present: int
    absent: int
    total: int
    percentage: float


class DateBreakdownItem(BaseModel):
    date: str
    present: int
    absent: int
    total: int


class AttendanceSummaryReport(BaseModel):
    total_records: int
    total_students: int
    total_sessions: int
    present_count: int
    absent_count: int
    left_count: int
    attendance_percentage: float
    average_duration_minutes: float
    records_by_session: list[SessionBreakdownItem]
    records_by_date: list[DateBreakdownItem]


class SessionStudentItem(BaseModel):
    user_id: str
    student_name: str
    join_time: datetime | None = None
    leave_time: datetime | None = None
    duration_minutes: float
    status: str


class SessionAttendanceReport(BaseModel):
    session_id: str
    session_name: str
    trainer_name: str
    date: str
    total_students: int
    present: int
    absent: int
    attendance_percentage: float
    average_duration_minutes: float
    students: list[SessionStudentItem]


class StudentSessionItem(BaseModel):
    session_id: str
    session_name: str
    join_time: datetime | None = None
    leave_time: datetime | None = None
    duration_minutes: float
    status: str


class StudentAttendanceReport(BaseModel):
    user_id: str
    student_name: str
    total_sessions_attended: int
    total_sessions_missed: int
    attendance_percentage: float
    total_duration_minutes: float
    sessions: list[StudentSessionItem]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_timezone(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def require_own_student_record(current_user: dict, user_id: str) -> None:
    if current_user["role"] == "Student" and current_user["id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Students can only access their own attendance reports.",
        )


def parse_date_param(value: str | None, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None

    try:
        parsed = datetime.strptime(value.strip(), "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date must be in YYYY-MM-DD format.",
        ) from exc

    parsed = parsed.replace(tzinfo=timezone.utc)
    if end_of_day:
        return parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    return parsed


def build_date_filter(start_date: str | None, end_date: str | None) -> dict:
    date_filter: dict = {}
    start = parse_date_param(start_date)
    end = parse_date_param(end_date, end_of_day=True)

    if start and end and end < start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date must be on or after start_date.",
        )

    if start or end:
        join_filter: dict = {}
        if start:
            join_filter["$gte"] = start
        if end:
            join_filter["$lte"] = end
        date_filter["join_time"] = join_filter

    return date_filter


async def get_student_name(user_id: str) -> str:
    if user_id.startswith("demo-"):
        role = user_id.replace("demo-", "").replace("-", " ").title()
        return f"{role} Demo"

    user = None
    try:
        user = await users_collection.find_one({"_id": ObjectId(user_id)})
    except Exception:
        user = await users_collection.find_one({"_id": user_id})

    if user:
        first_name = user.get("first_name", "").strip()
        last_name = user.get("last_name", "").strip()
        full_name = f"{first_name} {last_name}".strip()
        return full_name or user.get("email", user_id)

    return user_id


async def get_session_info(session_id: str) -> dict:
    managed = await managed_sessions_collection.find_one({"session_id": session_id})
    if managed:
        return {
            "session_id": session_id,
            "session_name": managed.get("session_name", session_id),
            "trainer_name": managed.get("trainer_name", ""),
            "date": managed.get("date", ""),
        }

    trainer = await trainer_sessions_collection.find_one({"room_id": session_id})
    if trainer:
        return {
            "session_id": session_id,
            "session_name": trainer.get("batch_name", session_id),
            "trainer_name": "",
            "date": trainer.get("scheduled_date", ""),
        }

    return {
        "session_id": session_id,
        "session_name": session_id,
        "trainer_name": "",
        "date": "",
    }


def is_present(status: str) -> bool:
    return status in PRESENT_STATUSES


def round_percentage(present: int, total: int) -> float:
    if total == 0:
        return 0.0
    return round((present / total) * 100, 2)


async def fetch_attendance_records(
    session_id: str | None = None,
    student_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    query: dict = {}
    query.update(build_date_filter(start_date, end_date))

    if session_id:
        query["session_id"] = session_id.strip()

    if student_id:
        query["user_id"] = student_id.strip()

    cursor = attendance_collection.find(query).sort("join_time", -1)
    return await cursor.to_list(length=2000)


@router.get("/reports/summary", response_model=AttendanceSummaryReport)
async def get_attendance_summary_report(
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
    _: dict = Depends(require_roles("Teacher", "Admin")),
) -> AttendanceSummaryReport:
    records = await fetch_attendance_records(
        session_id=session_id,
        start_date=start_date,
        end_date=end_date,
    )

    present_count = sum(1 for record in records if is_present(record.get("status", "")))
    absent_count = sum(1 for record in records if record.get("status") == "Absent")
    left_count = sum(1 for record in records if record.get("status") == "Left")
    total_duration_seconds = sum(int(record.get("duration_seconds", 0)) for record in records)

    session_map: dict[str, dict] = {}
    date_map: dict[str, dict] = {}

    for record in records:
        sid = record["session_id"]
        session_info = await get_session_info(sid)

        if sid not in session_map:
            session_map[sid] = {
                "session_id": sid,
                "session_name": session_info["session_name"],
                "present": 0,
                "absent": 0,
                "total": 0,
            }

        session_map[sid]["total"] += 1
        if is_present(record.get("status", "")):
            session_map[sid]["present"] += 1
        elif record.get("status") == "Absent":
            session_map[sid]["absent"] += 1

        join_time = record.get("join_time")
        if join_time:
            date_key = ensure_timezone(join_time).strftime("%Y-%m-%d")
            if date_key not in date_map:
                date_map[date_key] = {"date": date_key, "present": 0, "absent": 0, "total": 0}

            date_map[date_key]["total"] += 1
            if is_present(record.get("status", "")):
                date_map[date_key]["present"] += 1
            elif record.get("status") == "Absent":
                date_map[date_key]["absent"] += 1

    records_by_session = [
        SessionBreakdownItem(
            session_id=item["session_id"],
            session_name=item["session_name"],
            present=item["present"],
            absent=item["absent"],
            total=item["total"],
            percentage=round_percentage(item["present"], item["total"]),
        )
        for item in sorted(session_map.values(), key=lambda value: value["session_name"])
    ]

    records_by_date = [
        DateBreakdownItem(
            date=item["date"],
            present=item["present"],
            absent=item["absent"],
            total=item["total"],
        )
        for item in sorted(date_map.values(), key=lambda value: value["date"], reverse=True)
    ]

    return AttendanceSummaryReport(
        total_records=len(records),
        total_students=len({record["user_id"] for record in records}),
        total_sessions=len({record["session_id"] for record in records}),
        present_count=present_count,
        absent_count=absent_count,
        left_count=left_count,
        attendance_percentage=round_percentage(present_count, len(records)),
        average_duration_minutes=round(total_duration_seconds / 60 / len(records), 2) if records else 0.0,
        records_by_session=records_by_session,
        records_by_date=records_by_date,
    )


@router.get("/reports/session/{session_id}", response_model=SessionAttendanceReport)
async def get_session_attendance_report(
    session_id: str,
    _: dict = Depends(require_roles("Teacher", "Admin")),
) -> SessionAttendanceReport:
    session_id = session_id.strip()
    if not session_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Session ID is required.")

    records = await fetch_attendance_records(session_id=session_id)
    session_info = await get_session_info(session_id)

    students: list[SessionStudentItem] = []
    present = 0
    absent = 0
    total_duration_seconds = 0

    for record in records:
        status_value = record.get("status", "Absent")
        duration_seconds = int(record.get("duration_seconds", 0))
        total_duration_seconds += duration_seconds

        if is_present(status_value):
            present += 1
        elif status_value == "Absent":
            absent += 1

        students.append(
            SessionStudentItem(
                user_id=record["user_id"],
                student_name=await get_student_name(record["user_id"]),
                join_time=record.get("join_time"),
                leave_time=record.get("leave_time"),
                duration_minutes=round(duration_seconds / 60, 2),
                status=status_value,
            )
        )

    total_students = len(records)

    return SessionAttendanceReport(
        session_id=session_id,
        session_name=session_info["session_name"],
        trainer_name=session_info["trainer_name"],
        date=session_info["date"],
        total_students=total_students,
        present=present,
        absent=absent,
        attendance_percentage=round_percentage(present, total_students),
        average_duration_minutes=round(total_duration_seconds / 60 / total_students, 2) if total_students else 0.0,
        students=students,
    )


@router.get("/reports/student/{student_id}", response_model=StudentAttendanceReport)
async def get_student_attendance_report(
    student_id: str,
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    current_user: dict = Depends(require_roles("Student", "Teacher", "Admin")),
) -> StudentAttendanceReport:
    student_id = student_id.strip()
    if not student_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Student ID is required.")

    require_own_student_record(current_user, student_id)

    records = await fetch_attendance_records(
        student_id=student_id,
        start_date=start_date,
        end_date=end_date,
    )

    sessions: list[StudentSessionItem] = []
    attended = 0
    missed = 0
    total_duration_seconds = 0

    for record in records:
        status_value = record.get("status", "Absent")
        duration_seconds = int(record.get("duration_seconds", 0))
        total_duration_seconds += duration_seconds
        session_info = await get_session_info(record["session_id"])

        if is_present(status_value):
            attended += 1
        elif status_value == "Absent":
            missed += 1

        sessions.append(
            StudentSessionItem(
                session_id=record["session_id"],
                session_name=session_info["session_name"],
                join_time=record.get("join_time"),
                leave_time=record.get("leave_time"),
                duration_minutes=round(duration_seconds / 60, 2),
                status=status_value,
            )
        )

    total_sessions = len(records)

    return StudentAttendanceReport(
        user_id=student_id,
        student_name=await get_student_name(student_id),
        total_sessions_attended=attended,
        total_sessions_missed=missed,
        attendance_percentage=round_percentage(attended, total_sessions),
        total_duration_minutes=round(total_duration_seconds / 60, 2),
        sessions=sessions,
    )


@router.get("/reports/export")
async def export_attendance_report(
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
    _: dict = Depends(require_roles("Teacher", "Admin")),
):
    records = await fetch_attendance_records(
        session_id=session_id,
        start_date=start_date,
        end_date=end_date,
    )

    if format == "json":
        payload = []
        for record in records:
            session_info = await get_session_info(record["session_id"])
            payload.append(
                {
                    "student_name": await get_student_name(record["user_id"]),
                    "user_id": record["user_id"],
                    "session_id": record["session_id"],
                    "session_name": session_info["session_name"],
                    "join_time": record.get("join_time"),
                    "leave_time": record.get("leave_time"),
                    "duration_minutes": round(int(record.get("duration_seconds", 0)) / 60, 2),
                    "status": record.get("status", "Absent"),
                }
            )
        return payload

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Student Name",
            "User ID",
            "Session ID",
            "Session Name",
            "Join Time",
            "Leave Time",
            "Duration (min)",
            "Status",
        ]
    )

    for record in records:
        session_info = await get_session_info(record["session_id"])
        writer.writerow(
            [
                await get_student_name(record["user_id"]),
                record["user_id"],
                record["session_id"],
                session_info["session_name"],
                record.get("join_time"),
                record.get("leave_time"),
                round(int(record.get("duration_seconds", 0)) / 60, 2),
                record.get("status", "Absent"),
            ]
        )

    output.seek(0)
    filename = f"attendance-report-{utc_now().strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )