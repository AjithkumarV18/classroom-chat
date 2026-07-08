import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateSessionModal from "../components/trainer/CreateSessionModal";
import { trainerSessionsApi } from "../services/api";
import "./TrainerDashboard.css";

function TrainerDashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadSessions();
  }, []);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((firstSession, secondSession) => {
      const firstDate = new Date(`${firstSession.sessionDate}T${firstSession.sessionTime}`);
      const secondDate = new Date(`${secondSession.sessionDate}T${secondSession.sessionTime}`);
      return firstDate - secondDate;
    });
  }, [sessions]);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const response = await trainerSessionsApi.list();
      setSessions(response.map(mapTrainerSessionFromApi));
    } catch (error) {
      setErrorMessage(error.message || "Unable to load trainer sessions.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSession = async (session) => {
    try {
      setErrorMessage("");
      const createdSession = await trainerSessionsApi.create({
        room_id: session.id,
        batch_name: session.batchName,
        scheduled_date: session.sessionDate,
        scheduled_time: session.sessionTime,
        students_notified: false,
      });

      setSessions((currentSessions) => [
        mapTrainerSessionFromApi(createdSession),
        ...currentSessions,
      ]);
      setIsCreateModalOpen(false);
    } catch (error) {
      setErrorMessage(error.message || "Unable to create trainer session.");
    }
  };

  const handleNotifyStudents = async (sessionId) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    try {
      setErrorMessage("");
      const updatedSession = await trainerSessionsApi.update(session.objectId, {
        students_notified: true,
      });

      setSessions((currentSessions) =>
        currentSessions.map((item) =>
          item.id === sessionId ? mapTrainerSessionFromApi(updatedSession) : item
        )
      );

      alert(`Students notified for ${session.batchName}.`);
    } catch (error) {
      setErrorMessage(error.message || "Unable to notify students.");
    }
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

        {errorMessage ? <p className="dashboard-error">{errorMessage}</p> : null}

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
            {isLoading ? (
              <div className="sessions-empty">
                <h3>Loading sessions</h3>
                <p>Please wait while data loads from MongoDB.</p>
              </div>
            ) : sortedSessions.length > 0 ? (
              sortedSessions.map((session) => (
                <article className="session-card" key={session.objectId}>
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
                <p>Create a live session to save it in MongoDB.</p>
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

function mapTrainerSessionFromApi(session) {
  return {
    objectId: session.id,
    id: session.room_id,
    batchName: session.batch_name,
    sessionDate: session.scheduled_date,
    sessionTime: session.scheduled_time,
    studentsNotified: session.students_notified,
  };
}

function formatSessionDateTime(sessionDate, sessionTime) {
  const date = new Date(`${sessionDate}T${sessionTime}`);

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default TrainerDashboard;
