from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from bson import ObjectId
from fastapi import WebSocket


def encode_event(event: dict[str, Any]) -> str:
    def default(value: Any) -> str:
        if isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, (date, datetime)):
            return value.isoformat()
        return str(value)

    return json.dumps(event, default=default)


class ConnectionManager:
    def __init__(self) -> None:
        # session_id -> user_id -> WebSocket
        self._connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, session_id: str, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(session_id, {})[user_id] = websocket

    def disconnect(self, session_id: str, user_id: str) -> None:
        session = self._connections.get(session_id)
        if not session:
            return
        session.pop(user_id, None)
        if not session:
            self._connections.pop(session_id, None)

    def get_session_user_ids(self, session_id: str) -> list[str]:
        return list(self._connections.get(session_id, {}).keys())

    async def send_to_user(self, session_id: str, user_id: str, event: dict[str, Any]) -> None:
        ws = self._connections.get(session_id, {}).get(user_id)
        if ws:
            await ws.send_text(encode_event(event))

    async def broadcast(self, session_id: str, event: dict[str, Any], exclude_user_id: str | None = None) -> None:
        payload = encode_event(event)
        for uid, ws in list(self._connections.get(session_id, {}).items()):
            if exclude_user_id and uid == exclude_user_id:
                continue
            await ws.send_text(payload)


manager = ConnectionManager()
