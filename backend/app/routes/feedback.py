from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.authz import get_current_user, require_roles
from app.database import feedback_collection, managed_sessions_collection

router = APIRouter(prefix="/feedback", tags=["feedback"])
FeedbackTag = Literal["Excellent", "Good", "Average", "Poor"]


class FeedbackCreate(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    student_id: str = Field(..., min_length=1, max_length=120)
    trainer_id: str = Field(..., min_length=1, max_length=120)
    rating: int = Field(..., ge=1, le=5)
    review: str = Field(..., min_length=1, max_length=1200)
    tags: list[FeedbackTag] = Field(default_factory=list)

    @field_validator("session_id", "student_id", "trainer_id", "review")
    @classmethod
    def trim_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Value cannot be empty.")
        return cleaned

    @model_validator(mode="after")
    def validate_tags(self) -> "FeedbackCreate":
        self.tags = list(dict.fromkeys(self.tags))
        return self


class FeedbackResponse(BaseModel):
    id: str
    feedback_id: str
    session_id: str
    student_id: str
    trainer_id: str
    rating: int
    review: str
    tags: list[FeedbackTag]
    created_at: datetime


class FeedbackAnalytics(BaseModel):
    average_rating: float
    rating_distribution: dict[str, int]
    total_feedback: int


class FeedbackListResponse(BaseModel):
    items: list[FeedbackResponse]
    analytics: FeedbackAnalytics
    total: int
    page: int
    page_size: int


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_feedback(document: dict) -> FeedbackResponse:
    return FeedbackResponse(
        id=str(document["_id"]),
        feedback_id=document["feedback_id"],
        session_id=document["session_id"],
        student_id=document["student_id"],
        trainer_id=document["trainer_id"],
        rating=document["rating"],
        review=document["review"],
        tags=document.get("tags", []),
        created_at=document["created_at"],
    )


async def ensure_session_exists(session_id: str) -> None:
    session = await managed_sessions_collection.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")


def enforce_student_identity(student_id: str, current_user: dict) -> None:
    if current_user["role"] == "Student" and current_user["id"] != student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Students can submit feedback only for their own account.",
        )


def build_query(search: str | None = None) -> dict:
    query: dict = {}
    if search:
        value = search.strip()
        query["$or"] = [
            {"review": {"$regex": value, "$options": "i"}},
            {"tags": {"$regex": value, "$options": "i"}},
            {"student_id": {"$regex": value, "$options": "i"}},
        ]
    return query


async def calculate_analytics(query: dict) -> FeedbackAnalytics:
    pipeline = [
        {"$match": query},
        {
            "$group": {
                "_id": "$rating",
                "count": {"$sum": 1},
            }
        },
    ]
    distribution = {str(rating): 0 for rating in range(1, 6)}
    total = 0
    weighted_total = 0

    async for item in feedback_collection.aggregate(pipeline):
        rating = int(item["_id"])
        count = int(item["count"])
        distribution[str(rating)] = count
        total += count
        weighted_total += rating * count

    average = round(weighted_total / total, 2) if total else 0
    return FeedbackAnalytics(
        average_rating=average,
        rating_distribution=distribution,
        total_feedback=total,
    )


async def list_feedback(query: dict, page: int, page_size: int) -> FeedbackListResponse:
    skip = (page - 1) * page_size
    try:
        total = await feedback_collection.count_documents(query)
        analytics = await calculate_analytics(query)
        cursor = feedback_collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [serialize_feedback(document) async for document in cursor]
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Unable to load feedback.") from exc

    return FeedbackListResponse(
        items=items,
        analytics=analytics,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    payload: FeedbackCreate,
    current_user: dict = Depends(require_roles("Student", "Admin")),
) -> FeedbackResponse:
    enforce_student_identity(payload.student_id, current_user)
    await ensure_session_exists(payload.session_id)

    document = {
        "feedback_id": f"FDB-{str(ObjectId()).upper()}",
        "session_id": payload.session_id,
        "student_id": payload.student_id,
        "trainer_id": payload.trainer_id,
        "rating": payload.rating,
        "review": payload.review,
        "tags": payload.tags,
        "created_at": utc_now(),
    }

    try:
        result = await feedback_collection.insert_one(document)
        created = await feedback_collection.find_one({"_id": result.inserted_id})
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Feedback already submitted for this student and session.",
        ) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=500, detail="Unable to submit feedback.") from exc

    return serialize_feedback(created)


@router.get("/session/{session_id}", response_model=FeedbackListResponse)
async def get_feedback_by_session(
    session_id: str,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: dict = Depends(require_roles("Teacher", "Admin")),
) -> FeedbackListResponse:
    session_id = session_id.strip()
    if not session_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Session ID is required.")
    await ensure_session_exists(session_id)

    query = build_query(search)
    query["session_id"] = session_id
    return await list_feedback(query, page, page_size)


@router.get("/trainer/{trainer_id}", response_model=FeedbackListResponse)
async def get_trainer_feedback(
    trainer_id: str,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(require_roles("Teacher", "Admin")),
) -> FeedbackListResponse:
    trainer_id = trainer_id.strip()
    if not trainer_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Trainer ID is required.")
    if current_user["role"] == "Teacher" and current_user["id"] != trainer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teachers can view only their own feedback.")

    query = build_query(search)
    query["trainer_id"] = trainer_id
    return await list_feedback(query, page, page_size)