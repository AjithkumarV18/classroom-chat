from datetime import datetime, timezone
from typing import Any, Literal

from bson import ObjectId
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.config import settings
from app.database import (
    activity_logs_collection,
    chat_messages_collection,
    live_participants_collection,
    live_session_state_collection,
    live_session_recovery_logs_collection,
    managed_sessions_collection,
    trainer_sessions_collection,
    users_collection,
    whiteboard_entries_collection,
)

ParticipantStatus = Literal["waiting", "active", "removed", "disconnected"]
HandStatus = Literal["none", "raised", "approved", "dismissed"]

DEFAULT_PERMISSIONS = {
    "can_speak": False,
    "can_chat": True,
    "can_screen_share": False,
    "can_unmute_self": True,
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def session_exists(session_id: str) -> bool:
    if await managed_sessions_collection.find_one({"session_id": session_id}):
        return True
    return bool(await trainer_sessions_collection.find_one({"room_id": session_id}))


async def can_join_session(session_id: str, user: dict) -> bool:
    if is_trainer(user.get("role", "")):
        return True
    if user.get("role") != "Student":
        return False

    user_id = user.get("id", "")
    user_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
    user_document = await users_collection.find_one(user_query)
    if not user_document:
        return False

    batches = {
        value
        for value in (
            user_document.get("batch_id"),
            user_document.get("batch_name"),
            user_document.get("batch"),
        )
        if value
    }
    if not batches:
        return False

    trainer_session = await trainer_sessions_collection.find_one({"room_id": session_id})
    if trainer_session:
        return (
            trainer_session.get("batch_name") in batches
            and bool(trainer_session.get("students_notified"))
        )

    managed_session = await managed_sessions_collection.find_one({"session_id": session_id})
    managed_batch = (
        managed_session.get("batch_id")
        or managed_session.get("batch_name")
        or managed_session.get("batch")
        if managed_session
        else None
    )
    return managed_batch in batches


def decode_ws_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return {"id": payload["sub"], "email": payload.get("email"), "role": payload.get("role")}
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token.") from exc


async def get_or_create_session_state(session_id: str) -> dict:
    doc = await live_session_state_collection.find_one({"session_id": session_id})
    if doc:
        return doc
    now = utc_now()
    doc = {
        "session_id": session_id,
        "status": "idle",          # idle | live | ended
        "locked": False,
        "allow_rejoin_after_removal": False,
        "started_at": None,
        "ended_at": None,
        "recovery_status": "none",
        "recovery_deadline": None,
        "recovery_trainer_id": None,
        "created_at": now,
        "updated_at": now,
    }
    await live_session_state_collection.insert_one(doc)
    return doc


async def log_activity(session_id: str, event_type: str, actor_id: str, actor_name: str, metadata: dict | None = None) -> None:
    await activity_logs_collection.insert_one({
        "log_id": f"LOG-{str(ObjectId()).upper()}",
        "session_id": session_id,
        "event_type": event_type,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "metadata": metadata or {},
        "timestamp": utc_now(),
    })


async def log_recovery(session_id: str, event_type: str, trainer_id: str, metadata: dict | None = None) -> None:
    await live_session_recovery_logs_collection.insert_one({
        "log_id": f"REC-{str(ObjectId()).upper()}",
        "session_id": session_id,
        "event_type": event_type,
        "trainer_id": trainer_id,
        "metadata": metadata or {},
        "created_at": utc_now(),
    })


async def session_restore_snapshot(session_id: str) -> dict[str, Any]:
    chat_docs = await chat_messages_collection.find({"session_id": session_id}).sort("timestamp", 1).to_list(500)
    whiteboard_docs = await whiteboard_entries_collection.find({"session_id": session_id}).sort("timestamp", 1).to_list(1000)
    state = await get_or_create_session_state(session_id)
    return {
        "session_state": {
            "session_id": state["session_id"],
            "status": state.get("status", "idle"),
            "locked": state.get("locked", False),
            "started_at": state.get("started_at"),
            "ended_at": state.get("ended_at"),
            "recovery_status": state.get("recovery_status", "none"),
            "recovery_deadline": state.get("recovery_deadline"),
        },
        "participants": await list_participants(session_id),
        "chat_history": [
            {
                "message_id": str(doc.get("message_id")),
                "sender_id": doc.get("sender_id"),
                "sender_name": doc.get("sender_name"),
                "message": doc.get("message"),
                "message_type": doc.get("message_type", "Text"),
                "timestamp": doc.get("timestamp"),
            }
            for doc in chat_docs
        ],
        "whiteboard_state": [
            {
                "whiteboard_id": str(doc.get("whiteboard_id")),
                "user_id": doc.get("user_id"),
                "drawing_data": doc.get("drawing_data"),
                "tool_type": doc.get("tool_type"),
                "color": doc.get("color"),
                "stroke_width": doc.get("stroke_width"),
                "timestamp": doc.get("timestamp"),
            }
            for doc in whiteboard_docs
        ],
    }


async def get_user_display(user_id: str) -> dict[str, str]:
    user = await users_collection.find_one({"_id": ObjectId(user_id)}) if ObjectId.is_valid(user_id) else None
    if not user:
        return {"user_id": user_id, "name": "Unknown", "email": ""}
    return {
        "user_id": user_id,
        "name": user.get("name") or user.get("email", "").split("@")[0],
        "email": user.get("email", ""),
    }


async def serialize_participant(doc: dict) -> dict[str, Any]:
    user = await get_user_display(doc["user_id"])
    return {
        "user_id": doc["user_id"],
        "name": user["name"],
        "email": user["email"],
        "role": doc.get("role"),
        "status": doc.get("status", "active"),
        "hand_status": doc.get("hand_status", "none"),
        "mic_muted": doc.get("mic_muted", True),
        "camera_on": doc.get("camera_on", False),
        "permissions": doc.get("permissions", DEFAULT_PERMISSIONS),
        "joined_at": doc.get("joined_at"),
        "updated_at": doc.get("updated_at"),
    }


async def list_participants(session_id: str, search: str | None = None) -> list[dict]:
    query: dict[str, Any] = {"session_id": session_id}
    docs = await live_participants_collection.find(query).sort("joined_at", 1).to_list(length=500)
    items = [await serialize_participant(d) for d in docs]
    if search:
        q = search.lower()
        items = [p for p in items if q in p["name"].lower() or q in p["email"].lower()]
    return items


def is_trainer(role: str) -> bool:
    return role in ("Teacher", "Admin")
