import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthToken } from "../auth/auth";
import { API_ORIGIN } from "../services/api";

export function useLiveSession(sessionId) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [participants, setParticipants] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [you, setYou] = useState(null);
  const [sessionState, setSessionState] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [whiteboardEvents, setWhiteboardEvents] = useState([]);

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

    const wsBase = API_ORIGIN
      ? API_ORIGIN.replace(/^http/, "ws")
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
    const wsUrl = `${wsBase}/api/ws/live/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnectionError("");
    };
    ws.onclose = (event) => {
      setConnected(false);
      if (event.code === 4403) {
        setConnectionError("This session is not assigned to your batch.");
      } else if (event.code === 4404) {
        setConnectionError("Session not found.");
      }
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "session_snapshot":
          setSessionState(msg.payload.session_state);
          setYou(msg.payload.you);
          setParticipants(msg.payload.participants);
          setActiveCount(msg.payload.participants.filter((p) => p.status === "active").length);
          break;
        case "session_recovered":
          setSessionState(msg.payload.session_state);
          setParticipants(msg.payload.participants);
          setActiveCount(msg.payload.participants.filter((p) => p.status === "active").length);
          setWhiteboardEvents([{ type: "WHITEBOARD_STATE_SYNC", payload: { drawings: msg.payload.whiteboard_state || [] } }]);
          pushNotification("Session restored after trainer reconnect");
          break;
        case "participants_updated":
          setParticipants(msg.payload.participants);
          setActiveCount(msg.payload.active_count);
          break;
        case "WHITEBOARD_DRAW":
        case "WHITEBOARD_CLEAR":
        case "WHITEBOARD_UNDO":
        case "WHITEBOARD_REDO":
        case "WHITEBOARD_STATE_SYNC":
          setWhiteboardEvents((current) => [...current.slice(-80), msg]);
          break;
        case "notification":
          pushNotification(msg.payload.message);
          break;
        case "error":
          setConnectionError(msg.payload.message || "Unable to join this session.");
          pushNotification(msg.payload.message || "Unable to join this session.");
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
    connectionError,
    participants,
    activeCount,
    you,
    sessionState,
    notifications,
    whiteboardEvents,
    send,
    sendWhiteboardStroke: (stroke) => send("WHITEBOARD_DRAW", { stroke }),
    clearWhiteboard: () => send("WHITEBOARD_CLEAR"),
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
