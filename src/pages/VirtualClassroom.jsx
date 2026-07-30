import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ClassroomChat from "../ClassroomChat";
import JitsiVideoRoom from "../components/meeting/JitsiVideoRoom";
import MiniWhiteboard from "../components/meeting/MiniWhiteboard";
import { useLiveSession } from "../hooks/useLiveSession";
import { getAuthUser } from "../auth/auth";
import { liveSessionsApi, recordingsApi, trainerSessionsApi } from "../services/api";
import "./VirtualClassroom.css";

function getDisplayName(user) {
  if (!user) return "Guest";
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return fullName || user.email || user.id || "User";
}

function VirtualClassroom() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId") || "SESSION";
  const authUser = getAuthUser();
  const displayName = getDisplayName(authUser);
  const isTrainer = authUser?.role === "Teacher" || authUser?.role === "Admin";
  const [search, setSearch] = useState("");
  const [sidePanel, setSidePanel] = useState(null);
  const [sessionBatch, setSessionBatch] = useState("");
  const [recordingStatus, setRecordingStatus] = useState("idle");
  const [recordingError, setRecordingError] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const live = useLiveSession(sessionId);

  useEffect(() => {
    if (!isTrainer) return;
    trainerSessionsApi.list()
      .then((sessions) => {
        const match = sessions.find((session) => session.room_id === sessionId);
        setSessionBatch(match?.batch_name || "");
      })
      .catch(() => setSessionBatch(""));
  }, [isTrainer, sessionId]);

  useEffect(() => {
    return () => {
      window.clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return live.participants.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    );
  }, [live.participants, search]);

  const waiting = filtered.filter((p) => p.status === "waiting");
  const raisedHands = filtered.filter((p) => p.hand_status === "raised");
  const panelOpen = sidePanel !== null;

  const togglePanel = (panel) => {
    setSidePanel((current) => (current === panel ? null : panel));
  };

  const startRecording = async () => {
    if (!isTrainer || recordingStatus === "recording") return;
    try {
      setRecordingError("");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
      recordingChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(1000);
      setRecordingSeconds(0);
      setRecordingStatus("recording");
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
      localStorage.setItem(`recording:${sessionId}`, JSON.stringify({ status: "recording", startedAt: new Date().toISOString() }));
    } catch (error) {
      setRecordingStatus("failed");
      setRecordingError(error.message || "Unable to start recording.");
    }
  };

  const stopRecording = async () => {
    if (recordingStatus !== "recording" || !mediaRecorderRef.current) return;
    const confirmed = window.confirm("Stop and upload this recording?");
    if (!confirmed) return;
    const recorder = mediaRecorderRef.current;
    await new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.stop();
    });
    window.clearInterval(recordingTimerRef.current);
    setRecordingStatus("uploading");
    try {
      if (!sessionBatch) {
        throw new Error("Batch not found for this session. Start from Trainer Dashboard first.");
      }
      const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "video/webm" });
      const file = new File([blob], `${sessionId}-recording.webm`, { type: blob.type });
      await recordingsApi.upload({
        sessionId,
        batchId: sessionBatch,
        trainerId: authUser?.id,
        title: `${sessionId} Live Class Recording`,
        description: "Recorded from the live classroom screen.",
        duration: formatDuration(recordingSeconds),
        videoFile: file,
        visibility: "Public Batch",
      });
      localStorage.removeItem(`recording:${sessionId}`);
      setRecordingStatus("ready");
    } catch (error) {
      setRecordingStatus("failed");
      setRecordingError(error.message || "Unable to upload recording.");
    }
  };

  return (
    <main className="vc-meeting">
      <header className="vc-topbar">
        <div className="vc-topbar__info">
          <span className="vc-topbar__label">Virtual Classroom</span>
          <h1>{sessionId}</h1>
          <p className={`vc-status ${live.connected ? "vc-status--live" : ""}`}>
            <span className="vc-status__dot" aria-hidden="true" />
            {live.connectionError ? "Unable to join" : live.connected ? "Connected" : "Connecting..."} - {live.activeCount} in session
          </p>
          {live.connectionError ? <p className="vc-error">{live.connectionError}</p> : null}
        </div>

        {isTrainer && (
          <div className="vc-trainer-actions">
            <button type="button" className="vc-btn vc-btn--success" onClick={() => liveSessionsApi.start(sessionId)}>
              Start
            </button>
            <button type="button" className="vc-btn vc-btn--danger" onClick={() => liveSessionsApi.end(sessionId)}>
              End
            </button>
            <button type="button" className="vc-btn" onClick={() => liveSessionsApi.lock(sessionId, true)}>
              Lock
            </button>
            <button type="button" className="vc-btn" onClick={() => liveSessionsApi.lock(sessionId, false)}>
              Unlock
            </button>
            <button type="button" className="vc-btn" onClick={live.muteAll}>
              Mute All
            </button>
            <button
              type="button"
              className={`vc-btn ${recordingStatus === "recording" ? "vc-btn--danger" : ""}`}
              disabled={recordingStatus === "uploading"}
              onClick={recordingStatus === "recording" ? stopRecording : startRecording}
            >
              {recordingStatus === "recording" ? "Stop Recording" : recordingStatus === "uploading" ? "Uploading" : "Start Recording"}
            </button>
          </div>
        )}
      </header>

      {isTrainer && recordingStatus !== "idle" ? (
        <div className={`vc-recording-bar vc-recording-bar--${recordingStatus}`}>
          <span />
          <strong>{recordingStatus === "recording" ? "Recording" : recordingStatus}</strong>
          <small>{formatDuration(recordingSeconds)}</small>
          {recordingError ? <em>{recordingError}</em> : null}
        </div>
      ) : null}

      <div className={`vc-body ${panelOpen ? "vc-body--panel-open" : ""}`}>
        <section className="vc-stage" aria-label="Video meeting">
          {!live.connectionError ? (
            <JitsiVideoRoom sessionId={sessionId} displayName={displayName} email={authUser?.email} />
          ) : null}
        </section>

        {panelOpen && (
          <aside className="vc-sidepanel" aria-label="Meeting sidebar">
            <div className="vc-sidepanel__tabs">
              <button type="button" className={sidePanel === "participants" ? "active" : ""} onClick={() => setSidePanel("participants")}>
                People ({filtered.length})
              </button>
              <button type="button" className={sidePanel === "chat" ? "active" : ""} onClick={() => setSidePanel("chat")}>
                Chat
              </button>
              <button type="button" className={sidePanel === "whiteboard" ? "active" : ""} onClick={() => setSidePanel("whiteboard")}>
                Board
              </button>
              <button type="button" className="vc-sidepanel__close" onClick={() => setSidePanel(null)} aria-label="Close panel">
                x
              </button>
            </div>

            {sidePanel === "participants" && (
              <div className="vc-sidepanel__content">
                <input className="vc-search" placeholder="Search participants..." value={search} onChange={(e) => setSearch(e.target.value)} />

                {!isTrainer && (
                  <div className="vc-quick-actions">
                    <button type="button" onClick={live.you?.hand_status === "raised" ? live.lowerHand : live.raiseHand}>
                      {live.you?.hand_status === "raised" ? "Lower Hand" : "Raise Hand"}
                    </button>
                  </div>
                )}

                {isTrainer && waiting.length > 0 && (
                  <section className="vc-list-block">
                    <h3>Waiting Room ({waiting.length})</h3>
                    {waiting.map((p) => (
                      <div key={p.user_id} className="vc-list-row">
                        <span>{p.name}</span>
                        <div>
                          <button type="button" onClick={() => live.approveWaiting(p.user_id)}>Admit</button>
                          <button type="button" className="danger" onClick={() => live.rejectWaiting(p.user_id)}>Deny</button>
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {isTrainer && raisedHands.length > 0 && (
                  <section className="vc-list-block">
                    <h3>Raised Hands ({raisedHands.length})</h3>
                    {raisedHands.map((p) => (
                      <div key={p.user_id} className="vc-list-row">
                        <span>{p.name}</span>
                        <div>
                          <button type="button" onClick={() => live.approveHand(p.user_id)}>Allow</button>
                          <button type="button" onClick={() => live.dismissHand(p.user_id)}>Dismiss</button>
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                <section className="vc-list-block">
                  <h3>Participants</h3>
                  {filtered.length === 0 ? (
                    <p className="vc-empty">No participants yet.</p>
                  ) : (
                    filtered.map((p) => (
                      <div key={p.user_id} className={`vc-participant status-${p.status}`}>
                        <div className="vc-participant__avatar">{p.name.charAt(0).toUpperCase()}</div>
                        <div className="vc-participant__info">
                          <strong>{p.name}</strong>
                          <span>{p.status}{p.hand_status === "raised" ? " - hand raised" : ""}</span>
                        </div>
                        <div className="vc-participant__icons">
                          <span title={p.mic_muted ? "Muted" : "Unmuted"}>{p.mic_muted ? "M" : "Mic"}</span>
                          <span title={p.camera_on ? "Camera on" : "Camera off"}>{p.camera_on ? "Cam" : "Off"}</span>
                        </div>
                        {isTrainer && p.user_id !== authUser?.id && (
                          <div className="vc-participant__actions">
                            <button type="button" onClick={() => live.muteParticipant(p.user_id)}>Mute</button>
                            <button type="button" onClick={() => live.removeParticipant(p.user_id)}>Remove</button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </section>

                {live.notifications.length > 0 && (
                  <section className="vc-list-block">
                    <h3>Activity</h3>
                    {live.notifications.slice(0, 8).map((n) => (
                      <p key={n.id} className="vc-notification">{n.message}</p>
                    ))}
                  </section>
                )}
              </div>
            )}

            {sidePanel === "chat" && (
              <div className="vc-sidepanel__content vc-sidepanel__content--chat">
                <ClassroomChat sessionId={sessionId} />
              </div>
            )}

            {sidePanel === "whiteboard" && (
              <div className="vc-sidepanel__content">
                <MiniWhiteboard sessionId={sessionId} live={live} />
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="vc-toolbar">
        <div className="vc-toolbar__left">
          <span className="vc-toolbar__session">{sessionId}</span>
        </div>

        <div className="vc-toolbar__center">
          {!isTrainer && (
            <button type="button" className={`vc-tool ${live.you?.hand_status === "raised" ? "active" : ""}`} onClick={live.you?.hand_status === "raised" ? live.lowerHand : live.raiseHand} title="Raise hand">
              RH
            </button>
          )}
          <button type="button" className={`vc-tool ${sidePanel === "participants" ? "active" : ""}`} onClick={() => togglePanel("participants")} title="Participants">
            Pe
          </button>
          <button type="button" className={`vc-tool ${sidePanel === "chat" ? "active" : ""}`} onClick={() => togglePanel("chat")} title="Chat">
            Ch
          </button>
          <button type="button" className={`vc-tool ${sidePanel === "whiteboard" ? "active" : ""}`} onClick={() => togglePanel("whiteboard")} title="Whiteboard">
            Bd
          </button>
        </div>

        <div className="vc-toolbar__right">
          <Link to="/session-management" className="vc-leave-btn">Leave</Link>
        </div>
      </footer>
    </main>
  );
}

function getSupportedMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default VirtualClassroom;
