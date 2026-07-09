import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { managedSessionsApi } from "../services/api";
import "./SessionManagement.css";

const emptyForm = {
  sessionName: "",
  trainerName: "",
  date: "",
  time: "",
  duration: "",
  description: "",
  status: "Upcoming",
};

const statusOptions = ["Upcoming", "Live", "Completed"];

function SessionManagement() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [formValues, setFormValues] = useState(emptyForm);
  const [editingSession, setEditingSession] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const matchesSearch = session.sessionName
        .toLowerCase()
        .includes(searchTerm.trim().toLowerCase());
      const matchesStatus = statusFilter === "All" || session.status === statusFilter;
      const matchesDate = !dateFilter || session.date === dateFilter;

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [sessions, searchTerm, statusFilter, dateFilter]);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const response = await managedSessionsApi.list();
      setSessions(response.map(mapSessionFromApi));
    } catch (error) {
      setErrorMessage(error.message || "Unable to load sessions.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      session_name: formValues.sessionName.trim(),
      trainer_name: formValues.trainerName.trim(),
      date: formValues.date,
      time: formValues.time,
      duration: formValues.duration.trim(),
      description: formValues.description.trim(),
      status: formValues.status,
    };

    if (Object.values(payload).some((value) => !value)) {
      setErrorMessage("Please fill all session fields before saving.");
      return;
    }

    try {
      setErrorMessage("");

      if (editingSession) {
        const updatedSession = await managedSessionsApi.update(editingSession.objectId, payload);
        setSessions((currentSessions) =>
          currentSessions.map((session) =>
            session.objectId === editingSession.objectId ? mapSessionFromApi(updatedSession) : session
          )
        );
      } else {
        const createdSession = await managedSessionsApi.create(payload);
        setSessions((currentSessions) => [mapSessionFromApi(createdSession), ...currentSessions]);
      }

      resetForm();
    } catch (error) {
      setErrorMessage(error.message || "Unable to save session.");
    }
  };

  const handleEdit = (session) => {
    setEditingSession(session);
    setFormValues({
      sessionName: session.sessionName,
      trainerName: session.trainerName,
      date: session.date,
      time: session.time,
      duration: session.duration,
      description: session.description,
      status: session.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (session) => {
    try {
      setErrorMessage("");
      await managedSessionsApi.delete(session.objectId);
      setSessions((currentSessions) =>
        currentSessions.filter((item) => item.objectId !== session.objectId)
      );

      if (editingSession?.objectId === session.objectId) {
        resetForm();
      }
    } catch (error) {
      setErrorMessage(error.message || "Unable to delete session.");
    }
  };

  const handleJoinSession = (session) => {
    navigate(`/virtual-classroom?sessionId=${encodeURIComponent(session.sessionId)}`);
  };

  const resetForm = () => {
    setFormValues(emptyForm);
    setEditingSession(null);
  };

  return (
    <main className="session-management-page">
      <section className="session-management-shell" aria-label="Session management">
        <header className="session-management-header">
          <div>
            <p>Session Management</p>
            <h1>Manage Scheduled Sessions</h1>
            <span>Create, update, filter, and join virtual classroom sessions.</span>
          </div>
        </header>

        {errorMessage ? <p className="session-management-error">{errorMessage}</p> : null}

        <section className="session-form-panel" aria-labelledby="session-form-title">
          <div className="session-form-panel__header">
            <h2 id="session-form-title">{editingSession ? "Edit Session" : "Add New Session"}</h2>
            {editingSession ? (
              <button className="session-secondary-button" onClick={resetForm} type="button">
                Cancel Edit
              </button>
            ) : null}
          </div>

          <form className="session-form" onSubmit={handleSubmit}>
            <label>
              <span>Session Name</span>
              <input name="sessionName" onChange={handleChange} type="text" value={formValues.sessionName} />
            </label>
            <label>
              <span>Trainer Name</span>
              <input name="trainerName" onChange={handleChange} type="text" value={formValues.trainerName} />
            </label>
            <label>
              <span>Date</span>
              <input name="date" onChange={handleChange} type="date" value={formValues.date} />
            </label>
            <label>
              <span>Time</span>
              <input name="time" onChange={handleChange} type="time" value={formValues.time} />
            </label>
            <label>
              <span>Duration</span>
              <input name="duration" onChange={handleChange} placeholder="Example: 60 min" type="text" value={formValues.duration} />
            </label>
            <label>
              <span>Status</span>
              <select name="status" onChange={handleChange} value={formValues.status}>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="session-form__wide">
              <span>Description</span>
              <textarea name="description" onChange={handleChange} rows="3" value={formValues.description} />
            </label>
            <button className="session-primary-button" type="submit">
              {editingSession ? "Update Session" : "Add Session"}
            </button>
          </form>
        </section>

        <section className="session-filter-panel" aria-label="Search and filter sessions">
          <label>
            <span>Search Sessions</span>
            <input
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by session name"
              type="search"
              value={searchTerm}
            />
          </label>
          <label>
            <span>Filter by Status</span>
            <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="All">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Filter by Date</span>
            <input onChange={(event) => setDateFilter(event.target.value)} type="date" value={dateFilter} />
          </label>
          <button
            className="session-secondary-button"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("All");
              setDateFilter("");
            }}
            type="button"
          >
            Clear Filters
          </button>
        </section>

        <section className="session-list-panel" aria-labelledby="session-list-title">
          <div className="session-list-panel__header">
            <h2 id="session-list-title">Session List</h2>
            <span>{filteredSessions.length} shown</span>
          </div>

          <div className="managed-session-list">
            {isLoading ? (
              <div className="managed-session-empty">
                <h3>Loading sessions</h3>
                <p>Please wait while sessions load from MongoDB.</p>
              </div>
            ) : filteredSessions.length > 0 ? (
              filteredSessions.map((session) => (
                <article className="managed-session-card" key={session.objectId}>
                  <div>
                    <span className={`session-status session-status--${session.status.toLowerCase()}`}>{session.status}</span>
                    <h3>{session.sessionName}</h3>
                    <dl>
                      <div><dt>Session ID</dt><dd>{session.sessionId}</dd></div>
                      <div><dt>Trainer Name</dt><dd>{session.trainerName}</dd></div>
                      <div><dt>Date</dt><dd>{session.date}</dd></div>
                      <div><dt>Time</dt><dd>{session.time}</dd></div>
                      <div><dt>Duration</dt><dd>{session.duration}</dd></div>
                    </dl>
                    <p>{session.description}</p>
                  </div>
                  <div className="managed-session-actions">
                    <button className="join-session-button" onClick={() => handleJoinSession(session)} type="button">
                      Join Session
                    </button>
                    <button className="session-secondary-button" onClick={() => handleEdit(session)} type="button">
                      Edit
                    </button>
                    <button className="delete-session-button" onClick={() => handleDelete(session)} type="button">
                      Delete
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="managed-session-empty">
                <h3>No sessions found</h3>
                <p>Add a new session or adjust your search and filters.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function mapSessionFromApi(session) {
  return {
    objectId: session.id,
    sessionId: session.session_id,
    sessionName: session.session_name,
    trainerName: session.trainer_name,
    date: session.date,
    time: session.time,
    duration: session.duration,
    description: session.description,
    status: session.status,
  };
}

export default SessionManagement;
