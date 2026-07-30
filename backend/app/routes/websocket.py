import asyncio
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from bson import ObjectId

from app.config import settings
from app.database import live_participants_collection, live_session_state_collection, managed_sessions_collection, whiteboard_entries_collection
from app.live.connection_manager import encode_event, manager
from app.live.helpers import (
    DEFAULT_PERMISSIONS,
    can_join_session,
    get_or_create_session_state,
    is_trainer,
    list_participants,
    log_activity,
    log_recovery,
    serialize_participant,
    session_exists,
    session_restore_snapshot,
    decode_ws_token,
    utc_now,
)

router = APIRouter(tags=["websocket"])
recovery_tasks: dict[str, asyncio.Task] = {}


async def broadcast_state(session_id: str) -> None:
    participants = await list_participants(session_id)
    active_count = sum(1 for p in participants if p["status"] == "active")
    await manager.broadcast(session_id, {
        "type": "participants_updated",
        "payload": {"participants": participants, "active_count": active_count},
    })


async def auto_end_after_recovery_timeout(session_id: str, trainer_id: str) -> None:
    await asyncio.sleep(settings.live_session_recovery_timeout_seconds)
    state = await live_session_state_collection.find_one({"session_id": session_id})
    if not state or state.get("recovery_status") != "pending" or state.get("recovery_trainer_id") != trainer_id:
        return
    now = utc_now()
    await live_session_state_collection.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "ended",
            "ended_at": now,
            "recovery_status": "expired",
            "updated_at": now,
        }},
    )
    await managed_sessions_collection.update_one({"session_id": session_id}, {"$set": {"status": "Completed"}})
    await log_recovery(session_id, "trainer_recovery_timeout", trainer_id, {"timeout_seconds": settings.live_session_recovery_timeout_seconds})
    await manager.broadcast(session_id, {
        "type": "session_ended",
        "payload": {"reason": "trainer_recovery_timeout", "ended_at": now.isoformat()},
    })


async def start_trainer_recovery(session_id: str, user: dict) -> None:
    now = utc_now()
    deadline = now + timedelta(seconds=settings.live_session_recovery_timeout_seconds)
    await live_session_state_collection.update_one(
        {"session_id": session_id},
        {"$set": {
            "recovery_status": "pending",
            "recovery_deadline": deadline,
            "recovery_trainer_id": user["id"],
            "updated_at": now,
        }},
        upsert=True,
    )
    await log_recovery(session_id, "trainer_disconnected", user["id"], {"recovery_deadline": deadline.isoformat()})
    task = recovery_tasks.pop(session_id, None)
    if task:
        task.cancel()
    recovery_tasks[session_id] = asyncio.create_task(auto_end_after_recovery_timeout(session_id, user["id"]))
    await manager.broadcast(session_id, {
        "type": "trainer_reconnecting",
        "payload": {
            "trainer_id": user["id"],
            "timeout_seconds": settings.live_session_recovery_timeout_seconds,
            "recovery_deadline": deadline.isoformat(),
        },
    })


async def complete_trainer_recovery(session_id: str, user: dict, websocket: WebSocket) -> None:
    task = recovery_tasks.pop(session_id, None)
    if task:
        task.cancel()
    now = utc_now()
    await live_session_state_collection.update_one(
        {"session_id": session_id},
        {"$set": {
            "recovery_status": "none",
            "recovery_deadline": None,
            "recovery_trainer_id": None,
            "updated_at": now,
        }},
    )
    await log_recovery(session_id, "trainer_reconnected", user["id"])
    snapshot = await session_restore_snapshot(session_id)
    await websocket.send_text(encode_event({"type": "session_recovered", "payload": snapshot}))
    await manager.broadcast(session_id, {
        "type": "trainer_reconnected",
        "payload": {"trainer_id": user["id"], "restored_at": now.isoformat()},
    }, exclude_user_id=user["id"])


async def handle_join(session_id: str, user: dict, websocket: WebSocket) -> None:
    state = await get_or_create_session_state(session_id)
    existing = await live_participants_collection.find_one({"session_id": session_id, "user_id": user["id"]})

    if existing and existing.get("status") == "removed" and not state.get("allow_rejoin_after_removal"):
        await websocket.send_text(encode_event({"type": "error", "payload": {"message": "You were removed and cannot rejoin."}}))
        await websocket.close(code=4403)
        return

    if state.get("locked") and not is_trainer(user["role"]) and not (existing and existing.get("status") == "active"):
        await websocket.send_text(encode_event({"type": "error", "payload": {"message": "Session is locked."}}))
        await websocket.close(code=4403)
        return

    if state.get("status") != "live" and not is_trainer(user["role"]):
        status = "waiting"
    elif existing and existing.get("status") == "removed":
        status = "removed"
    else:
        status = "active"

    now = utc_now()
    doc = {
        "session_id": session_id,
        "user_id": user["id"],
        "role": user["role"],
        "status": status,
        "hand_status": existing.get("hand_status", "none") if existing else "none",
        "mic_muted": existing.get("mic_muted", True) if existing else True,
        "camera_on": existing.get("camera_on", False) if existing else False,
        "permissions": existing.get("permissions", DEFAULT_PERMISSIONS.copy()) if existing else DEFAULT_PERMISSIONS.copy(),
        "joined_at": existing.get("joined_at", now) if existing else now,
        "updated_at": now,
    }
    await live_participants_collection.update_one(
        {"session_id": session_id, "user_id": user["id"]},
        {"$set": doc},
        upsert=True,
    )

    await manager.connect(session_id, user["id"], websocket)
    await log_activity(session_id, "participant_joined", user["id"], user.get("email", user["id"]))

    refreshed_state = await get_or_create_session_state(session_id)
    if is_trainer(user["role"]) and refreshed_state.get("recovery_status") == "pending":
        await complete_trainer_recovery(session_id, user, websocket)

    participant = await serialize_participant(await live_participants_collection.find_one(
        {"session_id": session_id, "user_id": user["id"]}
    ))

    await websocket.send_text(encode_event({
        "type": "session_snapshot",
        "payload": {
            "session_state": await get_or_create_session_state(session_id),
            "you": participant,
            "participants": await list_participants(session_id),
        },
    }))

    if status == "waiting":
        await manager.broadcast(session_id, {"type": "waiting_participant", "payload": participant}, exclude_user_id=user["id"])
    else:
        await manager.broadcast(session_id, {"type": "notification", "payload": {"message": f"{participant['name']} joined"}}, exclude_user_id=user["id"])

    await broadcast_state(session_id)


@router.websocket("/ws/live/{session_id}")
async def live_session_ws(websocket: WebSocket, session_id: str, token: str = Query(...)):
    if not await session_exists(session_id):
        await websocket.close(code=4404)
        return

    user = decode_ws_token(token)
    if not await can_join_session(session_id, user):
        await websocket.accept()
        await websocket.send_text(encode_event({
            "type": "error",
            "payload": {"message": "This session is not assigned to your batch."},
        }))
        await websocket.close(code=4403)
        return
    await handle_join(session_id, user, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            await dispatch_event(session_id, user, data)
    except WebSocketDisconnect:
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": user["id"]},
            {"$set": {"status": "disconnected", "updated_at": utc_now()}},
        )
        manager.disconnect(session_id, user["id"])
        if is_trainer(user["role"]):
            await start_trainer_recovery(session_id, user)
        else:
            await log_activity(session_id, "participant_left", user["id"], user.get("email", user["id"]))
            await manager.broadcast(session_id, {"type": "notification", "payload": {"message": f"{user.get('email')} left"}})
        await broadcast_state(session_id)


async def dispatch_event(session_id: str, actor: dict, data: dict[str, Any]) -> None:
    event_type = data.get("type")
    payload = data.get("payload", {})
    trainer = is_trainer(actor["role"])

    if event_type == "WHITEBOARD_DRAW":
        stroke = payload.get("stroke")
        if not isinstance(stroke, dict) or not isinstance(stroke.get("points"), list) or len(stroke["points"]) < 2:
            await manager.send_to_user(session_id, actor["id"], {"type": "error", "payload": {"message": "Invalid whiteboard stroke."}})
            return
        doc = await live_participants_collection.find_one({"session_id": session_id, "user_id": actor["id"]})
        permissions = doc.get("permissions", DEFAULT_PERMISSIONS) if doc else DEFAULT_PERMISSIONS
        if not trainer and not permissions.get("can_chat", True):
            await manager.send_to_user(session_id, actor["id"], {"type": "error", "payload": {"message": "Whiteboard drawing is not allowed."}})
            return
        now = utc_now()
        entry = {
            "whiteboard_id": f"WB-{str(ObjectId()).upper()}",
            "session_id": session_id,
            "user_id": actor["id"],
            "drawing_data": stroke,
            "tool_type": "Eraser" if stroke.get("tool") == "eraser" else "Pen",
            "color": stroke.get("color", "#2563eb"),
            "stroke_width": int(stroke.get("strokeWidth", 4)),
            "timestamp": now,
        }
        await whiteboard_entries_collection.insert_one(entry)
        await manager.broadcast(session_id, {
            "type": "WHITEBOARD_DRAW",
            "payload": {
                "stroke": stroke,
                "user_id": actor["id"],
                "whiteboard_id": entry["whiteboard_id"],
                "timestamp": now.isoformat(),
            },
        })
        return

    if event_type == "WHITEBOARD_CLEAR" and trainer:
        await whiteboard_entries_collection.delete_many({"session_id": session_id})
        await manager.broadcast(session_id, {"type": "WHITEBOARD_CLEAR", "payload": {"session_id": session_id}})
        return

    if event_type in ("WHITEBOARD_UNDO", "WHITEBOARD_REDO", "WHITEBOARD_STATE_REQUEST", "WHITEBOARD_STATE_SYNC"):
        await manager.broadcast(session_id, {"type": event_type, "payload": payload}, exclude_user_id=actor["id"])
        return

    # --- Raise Hand (Task 1) ---
    if event_type == "raise_hand":
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": actor["id"]},
            {"$set": {"hand_status": "raised", "updated_at": utc_now()}},
        )
        await log_activity(session_id, "hand_raised", actor["id"], actor["email"])
        await manager.broadcast(session_id, {"type": "hand_raised", "payload": {"user_id": actor["id"]}})
        await broadcast_state(session_id)

    elif event_type == "lower_hand":
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": actor["id"]},
            {"$set": {"hand_status": "none", "updated_at": utc_now()}},
        )
        await broadcast_state(session_id)

    elif event_type == "approve_hand" and trainer:
        target_id = payload["user_id"]
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": target_id},
            {"$set": {"hand_status": "approved", "permissions.can_speak": True, "updated_at": utc_now()}},
        )
        await log_activity(session_id, "hand_approved", actor["id"], actor["email"], {"target_id": target_id})
        await manager.send_to_user(session_id, target_id, {"type": "hand_result", "payload": {"status": "approved"}})
        await broadcast_state(session_id)

    elif event_type == "dismiss_hand" and trainer:
        target_id = payload["user_id"]
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": target_id},
            {"$set": {"hand_status": "dismissed", "updated_at": utc_now()}},
        )
        await log_activity(session_id, "hand_dismissed", actor["id"], actor["email"], {"target_id": target_id})
        await manager.send_to_user(session_id, target_id, {"type": "hand_result", "payload": {"status": "dismissed"}})
        await broadcast_state(session_id)

    # --- Mic Control (Task 3) ---
    elif event_type == "toggle_mic":
        doc = await live_participants_collection.find_one({"session_id": session_id, "user_id": actor["id"]})
        perms = doc.get("permissions", DEFAULT_PERMISSIONS)
        if doc.get("mic_muted") and not perms.get("can_unmute_self") and not trainer:
            return
        new_muted = not doc.get("mic_muted", True)
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": actor["id"]},
            {"$set": {"mic_muted": new_muted, "updated_at": utc_now()}},
        )
        await log_activity(session_id, "mic_unmuted" if not new_muted else "mic_muted", actor["id"], actor["email"])
        await broadcast_state(session_id)

    elif event_type == "mute_participant" and trainer:
        target_id = payload["user_id"]
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": target_id},
            {"$set": {"mic_muted": True, "updated_at": utc_now()}},
        )
        await manager.send_to_user(session_id, target_id, {"type": "force_mute", "payload": {}})
        await log_activity(session_id, "participant_muted", actor["id"], actor["email"], {"target_id": target_id})
        await broadcast_state(session_id)

    elif event_type == "mute_all" and trainer:
        await live_participants_collection.update_many(
            {"session_id": session_id, "status": "active"},
            {"$set": {"mic_muted": True, "updated_at": utc_now()}},
        )
        await manager.broadcast(session_id, {"type": "force_mute", "payload": {"all": True}})
        await log_activity(session_id, "mute_all", actor["id"], actor["email"])
        await broadcast_state(session_id)

    elif event_type == "set_can_unmute" and trainer:
        value = bool(payload.get("can_unmute_self", True))
        target_id = payload.get("user_id")
        filt = {"session_id": session_id} if payload.get("all") else {"session_id": session_id, "user_id": target_id}
        await live_participants_collection.update_many(filt, {"$set": {"permissions.can_unmute_self": value, "updated_at": utc_now()}})
        await broadcast_state(session_id)

    # --- Camera Control (Task 4) ---
    elif event_type == "toggle_camera":
        doc = await live_participants_collection.find_one({"session_id": session_id, "user_id": actor["id"]})
        new_on = not doc.get("camera_on", False)
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": actor["id"]},
            {"$set": {"camera_on": new_on, "updated_at": utc_now()}},
        )
        await broadcast_state(session_id)

    elif event_type == "request_camera" and trainer:
        target_id = payload["user_id"]
        await manager.send_to_user(session_id, target_id, {"type": "camera_request", "payload": {}})

    # --- Participant Management (Task 2) ---
    elif event_type == "remove_participant" and trainer:
        target_id = payload["user_id"]
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": target_id},
            {"$set": {"status": "removed", "updated_at": utc_now()}},
        )
        await manager.send_to_user(session_id, target_id, {"type": "removed", "payload": {}})
        manager.disconnect(session_id, target_id)
        await log_activity(session_id, "participant_removed", actor["id"], actor["email"], {"target_id": target_id})
        await broadcast_state(session_id)

    # --- Waiting Room (Task 7) ---
    elif event_type == "approve_waiting" and trainer:
        target_id = payload["user_id"]
        await live_participants_collection.update_one(
            {"session_id": session_id, "user_id": target_id},
            {"$set": {"status": "active", "updated_at": utc_now()}},
        )
        await manager.send_to_user(session_id, target_id, {"type": "admitted", "payload": {}})
        await log_activity(session_id, "waiting_approved", actor["id"], actor["email"], {"target_id": target_id})
        await broadcast_state(session_id)

    elif event_type == "reject_waiting" and trainer:
        target_id = payload["user_id"]
        await manager.send_to_user(session_id, target_id, {"type": "rejected", "payload": {}})
        manager.disconnect(session_id, target_id)
        await live_participants_collection.delete_one({"session_id": session_id, "user_id": target_id})
        await broadcast_state(session_id)

    # --- Permissions (Task 6) ---
    elif event_type == "update_permissions" and trainer:
        target_id = payload["user_id"]
        updates = {f"permissions.{k}": v for k, v in payload.get("permissions", {}).items()}
        updates["updated_at"] = utc_now()
        await live_participants_collection.update_one({"session_id": session_id, "user_id": target_id}, {"$set": updates})
        await manager.send_to_user(session_id, target_id, {"type": "permissions_updated", "payload": payload["permissions"]})
        await broadcast_state(session_id)
