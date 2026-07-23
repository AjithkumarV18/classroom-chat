from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.authz import get_current_user, require_roles
from app.database import activity_logs_collection, live_session_state_collection, managed_sessions_collection
from app.live.connection_manager import manager
from app.live.helpers import get_or_create_session_state, list_participants, log_activity, session_exists, utc_now

router = APIRouter(prefix="/live-sessions", tags=["live-sessions"])


class SessionControlResponse(BaseModel):
    session_id: str
    status: str
    locked: bool
    started_at: datetime | None
    ended_at: datetime | None


@router.post("/{session_id}/start", response_model=SessionControlResponse)
async def start_session(session_id: str, user=Depends(require_roles("Teacher", "Admin"))):
    if not await session_exists(session_id):
        raise HTTPException(404, "Invalid session.")
    now = utc_now()
    await live_session_state_collection.update_one(
        {"session_id": session_id},
        {"$set": {"status": "live", "started_at": now, "ended_at": None, "updated_at": now}},
        upsert=True,
    )
    await managed_sessions_collection.update_one({"session_id": session_id}, {"$set": {"status": "Live"}})
    await log_activity(session_id, "session_started", user["id"], user["email"])
    await manager.broadcast(session_id, {"type": "notification", "payload": {"message": "Session started"}})
    state = await get_or_create_session_state(session_id)
    return SessionControlResponse(session_id=session_id, status=state["status"], locked=state["locked"],
                                   started_at=state.get("started_at"), ended_at=state.get("ended_at"))


@router.post("/{session_id}/end", response_model=SessionControlResponse)
async def end_session(session_id: str, user=Depends(require_roles("Teacher", "Admin"))):
    now = utc_now()
    await live_session_state_collection.update_one(
        {"session_id": session_id},
        {"$set": {"status": "ended", "ended_at": now, "updated_at": now}},
    )
    await managed_sessions_collection.update_one({"session_id": session_id}, {"$set": {"status": "Completed"}})
    await log_activity(session_id, "session_ended", user["id"], user["email"])
    await manager.broadcast(session_id, {"type": "session_ended", "payload": {}})
    state = await get_or_create_session_state(session_id)
    return SessionControlResponse(session_id=session_id, status=state["status"], locked=state["locked"],
                                   started_at=state.get("started_at"), ended_at=state.get("ended_at"))


@router.post("/{session_id}/lock")
async def lock_session(session_id: str, locked: bool = True, user=Depends(require_roles("Teacher", "Admin"))):
    await live_session_state_collection.update_one(
        {"session_id": session_id},
        {"$set": {"locked": locked, "updated_at": utc_now()}},
        upsert=True,
    )
    await log_activity(session_id, "session_locked" if locked else "session_unlocked", user["id"], user["email"])
    await manager.broadcast(session_id, {"type": "session_locked", "payload": {"locked": locked}})
    return {"session_id": session_id, "locked": locked}


@router.get("/{session_id}/participants")
async def get_participants(session_id: str, search: str | None = Query(None), user=Depends(get_current_user)):
    return {"participants": await list_participants(session_id, search=search)}


@router.get("/{session_id}/activity-logs")
async def get_activity_logs(session_id: str, user=Depends(require_roles("Teacher", "Admin"))):
    logs = await activity_logs_collection.find({"session_id": session_id}).sort("timestamp", -1).to_list(500)
    for log in logs:
        log["id"] = str(log.pop("_id"))
    return {"logs": logs}