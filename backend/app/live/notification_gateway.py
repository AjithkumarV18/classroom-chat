from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket


class NotificationGateway:
    def __init__(self) -> None:
        self._channels: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, channel: str, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._channels.setdefault(channel, {})[user_id] = websocket

    def disconnect(self, channel: str, user_id: str) -> None:
        members = self._channels.get(channel)
        if not members:
            return
        members.pop(user_id, None)
        if not members:
            self._channels.pop(channel, None)

    async def broadcast(self, channel: str, event: dict[str, Any]) -> set[str]:
        payload = json.dumps(event, default=str)
        delivered_user_ids: set[str] = set()
        for user_id, ws in list(self._channels.get(channel, {}).items()):
            try:
                await ws.send_text(payload)
                delivered_user_ids.add(user_id)
            except Exception:
                self.disconnect(channel, user_id)
        return delivered_user_ids

    async def broadcast_to_recipients(
        self,
        channel: str,
        recipient_user_ids: list[str],
        event: dict[str, Any],
    ) -> set[str]:
        delivered_user_ids = await self.broadcast(channel, event)
        for user_id in recipient_user_ids:
            delivered_user_ids.update(
                await self.broadcast(f"user_{user_id}", event)
            )
        return delivered_user_ids


notification_gateway = NotificationGateway()
