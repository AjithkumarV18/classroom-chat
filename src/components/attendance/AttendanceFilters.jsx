import React from "react";

const statusOptions = ["All", "Present", "Absent", "Late", "Left"];

function AttendanceFilters({
  filters,
  sessions,
  onChange,
  onClear,
}) {
  return (
    <form className="attendance-filters" aria-label="Attendance search and filters">
      <label>
        <span>Search Student</span>
        <input
          name="search"
          onChange={onChange}
          placeholder="Search by student name"
          type="search"
          value={filters.search}
        />
      </label>

      <label>
        <span>Session</span>
        <select name="sessionId" onChange={onChange} value={filters.sessionId}>
          <option value="All">All Sessions</option>
          {sessions.map((session) => (
            <option key={session.sessionId} value={session.sessionId}>
              {session.sessionName}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Status</span>
        <select name="status" onChange={onChange} value={filters.status}>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Date</span>
        <input name="date" onChange={onChange} type="date" value={filters.date} />
      </label>

      <button className="attendance-secondary-button" onClick={onClear} type="button">
        Clear Filters
      </button>
    </form>
  );
}

export default AttendanceFilters;
