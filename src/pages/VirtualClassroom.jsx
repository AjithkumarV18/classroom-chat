import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ClassroomChat from "../ClassroomChat";
import JitsiVideoRoom from "../components/meeting/JitsiVideoRoom";
import { useLiveSession } from "../hooks/useLiveSession";
import { getAuthUser } from "../auth/auth";
import { liveSessionsApi } from "../services/api";
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

  const live = useLiveSession(sessionId);

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

  return (
    <main className="vc-meeting">
      <header className="vc-topbar">
        <div className="vc-topbar__info">
          <span className="vc-topbar__label">Virtual Classroom</span>
          <h1>{sessionId}</h1>
          <p className={`vc-status ${live.connected ? "vc-status--live" : ""}`}>
            <span className="vc-status__dot" aria-hidden="true" />
            {live.connected ? "Connected" : "Connecting..."} · {live.activeCount} in session
          </p>
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
          </div>
        )}
      </header>

      <div className={`vc-body ${panelOpen ? "vc-body--panel-open" : ""}`}>
        <section className="vc-stage" aria-label="Video meeting">
          <JitsiVideoRoom
            sessionId={sessionId}
            displayName={displayName}
            email={authUser?.email}
          />
        </section>

        {panelOpen && (
          <aside className="vc-sidepanel" aria-label="Meeting sidebar">
            <div className="vc-sidepanel__tabs">
              <button
                type="button"
                className={sidePanel === "participants" ? "active" : ""}
                onClick={() => setSidePanel("participants")}
              >
                People ({filtered.length})
              </button>
              <button
                type="button"
                className={sidePanel === "chat" ? "active" : ""}
                onClick={() => setSidePanel("chat")}
              >
                Chat
              </button>
              <button type="button" className="vc-sidepanel__close" onClick={() => setSidePanel(null)} aria-label="Close panel">
                ×
              </button>
            </div>

            {sidePanel === "participants" && (
              <div className="vc-sidepanel__content">
                <input
                  className="vc-search"
                  placeholder="Search participants..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

                {!isTrainer && (
                  <div className="vc-quick-actions">
                    <button type="button" onClick={live.you?.hand_status === "raised" ? live.lowerHand : live.raiseHand}>
                      {live.you?.hand_status === "raised" ? "✋ Lower Hand" : "✋ Raise Hand"}
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
                          <span>{p.status}{p.hand_status === "raised" ? " · hand raised" : ""}</span>
                        </div>
                        <div className="vc-participant__icons">
                          <span title={p.mic_muted ? "Muted" : "Unmuted"}>{p.mic_muted ? "🔇" : "🎤"}</span>
                          <span title={p.camera_on ? "Camera on" : "Camera off"}>{p.camera_on ? "📷" : "📷✕"}</span>
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
          </aside>
        )}
      </div>

      <footer className="vc-toolbar">
        <div className="vc-toolbar__left">
          <span className="vc-toolbar__session">{sessionId}</span>
        </div>

        <div className="vc-toolbar__center">
          {!isTrainer && (
            <button
              type="button"
              className={`vc-tool ${live.you?.hand_status === "raised" ? "active" : ""}`}
              onClick={live.you?.hand_status === "raised" ? live.lowerHand : live.raiseHand}
              title="Raise hand"
            >
              ✋
            </button>
          )}
          <button
            type="button"
            className={`vc-tool ${sidePanel === "participants" ? "active" : ""}`}
            onClick={() => togglePanel("participants")}
            title="Participants"
          >
            👥
          </button>
          <button
            type="button"
            className={`vc-tool ${sidePanel === "chat" ? "active" : ""}`}
            onClick={() => togglePanel("chat")}
            title="Chat"
          >
            💬
          </button>
        </div>

        <div className="vc-toolbar__right">
          <Link to="/session-management" className="vc-leave-btn">
            Leave
          </Link>
        </div>
      </footer>
    </main>
  );
}

export default VirtualClassroom;
