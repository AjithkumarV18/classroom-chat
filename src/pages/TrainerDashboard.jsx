import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateSessionModal from "../components/trainer/CreateSessionModal";
import "./TrainerDashboard.css";

const initialSessions = [
  {
    id: "ROOM-AI2048",
    batchName: "AI Foundations - Batch A",
    sessionDate: "2026-07-07",
    sessionTime: "10:30",
    studentsNotified: false,
  },
  {
    id: "ROOM-ML7312",
    batchName: "Machine Learning - Batch B",
    sessionDate: "2026-07-08",
    sessionTime: "15:00",
    studentsNotified: false,
  },
];

function TrainerDashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(initialSessions);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((firstSession, secondSession) => {
      const firstDate = new Date(`${firstSession.sessionDate}T${firstSession.sessionTime}`);
      const secondDate = new Date(`${secondSession.sessionDate}T${secondSession.sessionTime}`);
      return firstDate - secondDate;
    });
  }, [sessions]);

  const handleCreateSession = (session) => {
    setSessions((currentSessions) => [session, ...currentSessions]);
    setIsCreateModalOpen(false);
  };

  const handleNotifyStudents = (sessionId) => {
    const session = sessions.find((item) => item.id === sessionId);

    setSessions((currentSessions) =>
      currentSessions.map((item) =>
        item.id === sessionId ? { ...item, studentsNotified: true } : item
      )
    );

    alert(`Students notified for ${session?.batchName || "this session"}.`);
  };

  const handleStartSession = (sessionId) => {
    navigate(`/classroom?sessionId=${encodeURIComponent(sessionId)}`);
  };

  return (
    <main className="trainer-dashboard-page">
      <section className="trainer-dashboard-shell" aria-label="Trainer dashboard">
        <header className="trainer-dashboard-header">
          <div>
            <p>Trainer Administration</p>
            <h1>Live Class Dashboard</h1>
            <span>Manage scheduled sessions and launch the classroom whiteboard.</span>
          </div>
          <button
            className="create-session-button"
            onClick={() => setIsCreateModalOpen(true)}
            type="button"
          >
            + Create Live Session
          </button>
        </header>

        <section className="dashboard-summary" aria-label="Session summary">
          <article>
            <span>Upcoming Sessions</span>
            <strong>{sessions.length}</strong>
          </article>
          <article>
            <span>Students Notified</span>
            <strong>{sessions.filter((session) => session.studentsNotified).length}</strong>
          </article>
          <article>
            <span>Ready to Start</span>
            <strong>{sessions.filter((session) => !session.studentsNotified).length}</strong>
          </article>
        </section>

        <section className="sessions-panel" aria-labelledby="upcoming-sessions-title">
          <div className="sessions-panel__titlebar">
            <div>
              <h2 id="upcoming-sessions-title">Upcoming Sessions List</h2>
              <p>Each scheduled class includes its room, batch, and date/time.</p>
            </div>
          </div>

          <div className="sessions-list">
            {sortedSessions.length > 0 ? (
              sortedSessions.map((session) => (
                <article className="session-card" key={session.id}>
                  <div className="session-card__content">
                    <span className="session-card__eyebrow">Room ID</span>
                    <h3>{session.id}</h3>
                    <dl>
                      <div>
                        <dt>Batch Name</dt>
                        <dd>{session.batchName}</dd>
                      </div>
                      <div>
                        <dt>Scheduled Date/Time</dt>
                        <dd>{formatSessionDateTime(session.sessionDate, session.sessionTime)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="session-card__actions">
                    {session.studentsNotified ? (
                      <span className="notified-badge">? Students Notified</span>
                    ) : (
                      <button
                        className="notify-button"
                        onClick={() => handleNotifyStudents(session.id)}
                        type="button"
                      >
                        Notify Students
                      </button>
                    )}
                    <button
                      className="start-session-button"
                      onClick={() => handleStartSession(session.id)}
                      type="button"
                    >
                      Start Session
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="sessions-empty">
                <h3>No live sessions scheduled</h3>
                <p>Create a live session to add it to the trainer dashboard.</p>
              </div>
            )}
          </div>
        </section>
      </section>

      <CreateSessionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateSession={handleCreateSession}
      />
    </main>
  );
}

function formatSessionDateTime(sessionDate, sessionTime) {
  const date = new Date(`${sessionDate}T${sessionTime}`);

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default TrainerDashboard;
