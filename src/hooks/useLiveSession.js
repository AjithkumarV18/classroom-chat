import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthToken } from "../auth/auth";
import { API_ORIGIN } from "../services/api";

export function useLiveSession(sessionId) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [you, setYou] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const pushNotification = useCallback((message) => {
    setNotifications((prev) => [{ id: Date.now(), message }, ...prev].slice(0, 20));
  }, []);

  const send = useCallback((type, payload = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!sessionId || !token) return;

    const wsUrl = `${API_ORIGIN.replace(/^http/, "ws")}/api/ws/live/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "session_snapshot":
          setSessionState(msg.payload.session_state);
          setYou(msg.payload.you);
          setParticipants(msg.payload.participants);
          setActiveCount(msg.payload.participants.filter((p) => p.status === "active").length);
          break;
        case "participants_updated":
          setParticipants(msg.payload.participants);
          setActiveCount(msg.payload.active_count);
          break;
        case "notification":
          pushNotification(msg.payload.message);
          break;
        case "hand_result":
          pushNotification(`Your hand request was ${msg.payload.status}`);
          break;
        case "force_mute":
          pushNotification("You were muted by the trainer");
          break;
        case "removed":
          pushNotification("You were removed from the session");
          ws.close();
          break;
        case "session_ended":
          pushNotification("Session ended by trainer");
          break;
        case "session_locked":
          pushNotification(msg.payload.locked ? "Session locked" : "Session unlocked");
          break;
        default:
          break;
      }
    };

    return () => ws.close();
  }, [sessionId, pushNotification]);

  return {
    connected,
    participants,
    activeCount,
    you,
    sessionState,
    notifications,
    send,
    raiseHand: () => send("raise_hand"),
    lowerHand: () => send("lower_hand"),
    toggleMic: () => send("toggle_mic"),
    toggleCamera: () => send("toggle_camera"),
    approveHand: (userId) => send("approve_hand", { user_id: userId }),
    dismissHand: (userId) => send("dismiss_hand", { user_id: userId }),
    muteParticipant: (userId) => send("mute_participant", { user_id: userId }),
    muteAll: () => send("mute_all"),
    removeParticipant: (userId) => send("remove_participant", { user_id: userId }),
    approveWaiting: (userId) => send("approve_waiting", { user_id: userId }),
    rejectWaiting: (userId) => send("reject_waiting", { user_id: userId }),
    updatePermissions: (userId, permissions) => send("update_permissions", { user_id: userId, permissions }),
    requestCamera: (userId) => send("request_camera", { user_id: userId }),
  };
}