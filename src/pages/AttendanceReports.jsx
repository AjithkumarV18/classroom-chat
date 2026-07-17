import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAuthUser } from "../auth/auth";
import {
  attendanceReportsApi,
  managedSessionsApi,
} from "../services/api";
import AttendanceCard from "../components/attendance/AttendanceCard";
import AttendanceStatsCard from "../components/attendance/AttendanceStatsCard";
import "./AttendanceReports.css";

const initialFilters = {
  startDate: "",
  endDate: "",
  sessionId: "All",
};

function AttendanceReports() {
  const authUser = getAuthUser();
  const userRole = authUser?.role || "";
  const isStudent = userRole === "Student";

  const [filters, setFilters] = useState(initialFilters);
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [studentReport, setStudentReport] = useState(null);
  const [selectedSessionReport, setSelectedSessionReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadReports();
  }, []);

  const queryParams = useMemo(() => {
    const params = {};
    if (filters.startDate) params.start_date = filters.startDate;
    if (filters.endDate) params.end_date = filters.endDate;
    if (filters.sessionId !== "All") params.session_id = filters.sessionId;
    return params;
  }, [filters]);

  const loadReports = async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");

      if (isStudent) {
        const studentId = authUser?.id || authUser?.user_id;
        const report = await attendanceReportsApi.byStudent(studentId, queryParams);
        setStudentReport(report);
        setSummary(null);
        setSelectedSessionReport(null);
        return;
      }

      const [summaryResponse, sessionResponse] = await Promise.all([
        attendanceReportsApi.summary(queryParams),
        managedSessionsApi.list(),
      ]);

      setSummary(summaryResponse);
      setSessions(
        sessionResponse.map((session) => ({
          sessionId: session.session_id,
          sessionName: session.session_name,
        }))
      );
      setStudentReport(null);
      setSelectedSessionReport(null);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load attendance reports.");
      setSummary(null);
      setStudentReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const handleApplyFilters = () => {
    loadReports();
  };

  const handleExport = async () => {
    try {
      await attendanceReportsApi.exportCsv(queryParams);
    } catch (error) {
      setErrorMessage(error.message || "Unable to export report.");
    }
  };

  const handleViewSessionReport = async (sessionId) => {
    try {
      setErrorMessage("");
      const report = await attendanceReportsApi.bySession(sessionId);
      setSelectedSessionReport(report);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load session report.");
    }
  };

  return (
    <main className="attendance-page attendance-reports-page">
      <section className="attendance-shell" aria-label="Attendance reports">
        <header className="attendance-header">
          <div>
            <p>Attendance Reports</p>
            <h1>{isStudent ? "My Attendance Report" : "Class Attendance Reports"}</h1>
            <span>
              {isStudent
                ? "View your attendance percentage and session history."
                : "Generate summaries, review session performance, and export reports."}
            </span>
          </div>
          <div className="attendance-reports-header-actions">
            {!isStudent ? (
              <button className="attendance-secondary-button" onClick={handleExport} type="button">
                Export CSV
              </button>
            ) : null}
            <Link to={isStudent ? "/attendance" : "/session-management"}>
              {isStudent ? "View Records" : "Manage Sessions"}
            </Link>
          </div>
        </header>

        {errorMessage ? <p className="attendance-error">{errorMessage}</p> : null}

        <AttendanceCard title="Report Filters">
          <form className="attendance-filters" onSubmit={(event) => event.preventDefault()}>
            <label>
              <span>Start Date</span>
              <input
                name="startDate"
                onChange={handleFilterChange}
                type="date"
                value={filters.startDate}
              />
            </label>

            <label>
              <span>End Date</span>
              <input
                name="endDate"
                onChange={handleFilterChange}
                type="date"
                value={filters.endDate}
              />
            </label>

            {!isStudent ? (
              <label>
                <span>Session</span>
                <select name="sessionId" onChange={handleFilterChange} value={filters.sessionId}>
                  <option value="All">All Sessions</option>
                  {sessions.map((session) => (
                    <option key={session.sessionId} value={session.sessionId}>
                      {session.sessionName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <button className="attendance-secondary-button" onClick={handleApplyFilters} type="button">
              Apply Filters
            </button>

            <button
              className="attendance-secondary-button"
              onClick={() => {
                setFilters(initialFilters);
                setTimeout(loadReports, 0);
              }}
              type="button"
            >
              Clear Filters
            </button>
          </form>
        </AttendanceCard>

        {isLoading ? (
          <div className="attendance-loading">
            <span aria-hidden="true" />
            <p>Loading attendance reports...</p>
          </div>
        ) : isStudent ? (
          <StudentReportView report={studentReport} />
        ) : (
          <TeacherReportView
            onViewSession={handleViewSessionReport}
            selectedSessionReport={selectedSessionReport}
            summary={summary}
          />
        )}
      </section>
    </main>
  );
}

function TeacherReportView({ summary, selectedSessionReport, onViewSession }) {
  if (!summary) {
    return (
      <div className="attendance-empty">
        <h3>No report data available</h3>
        <p>Mark attendance first, then refresh this page.</p>
      </div>
    );
  }

  return (
    <>
      <section className="attendance-stats-grid" aria-label="Report summary">
        <AttendanceStatsCard label="Total Records" value={summary.total_records} />
        <AttendanceStatsCard label="Total Students" value={summary.total_students} />
        <AttendanceStatsCard label="Present" value={summary.present_count} tone="present" />
        <AttendanceStatsCard
          label="Attendance Percentage"
          value={`${summary.attendance_percentage}%`}
          tone="percentage"
        />
      </section>

      <AttendanceCard title="Session-wise Breakdown" meta={`${summary.records_by_session.length} sessions`}>
        <div className="attendance-table-wrap">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Total</th>
                <th>Percentage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary.records_by_session.map((item) => (
                <tr key={item.session_id}>
                  <td>{item.session_name}</td>
                  <td>{item.present}</td>
                  <td>{item.absent}</td>
                  <td>{item.total}</td>
                  <td>{item.percentage}%</td>
                  <td>
                    <button
                      className="attendance-link-button"
                      onClick={() => onViewSession(item.session_id)}
                      type="button"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AttendanceCard>

      <AttendanceCard title="Date-wise Breakdown" meta={`${summary.records_by_date.length} dates`}>
        <div className="attendance-table-wrap">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.records_by_date.map((item) => (
                <tr key={item.date}>
                  <td>{item.date}</td>
                  <td>{item.present}</td>
                  <td>{item.absent}</td>
                  <td>{item.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AttendanceCard>

      {selectedSessionReport ? (
        <AttendanceCard
          title={`Session Report: ${selectedSessionReport.session_name}`}
          meta={`${selectedSessionReport.total_students} students`}
        >
          <div className="attendance-reports-session-meta">
            <p>Trainer: {selectedSessionReport.trainer_name || "Not available"}</p>
            <p>Date: {selectedSessionReport.date || "Not available"}</p>
            <p>Attendance: {selectedSessionReport.attendance_percentage}%</p>
            <p>Average Duration: {selectedSessionReport.average_duration_minutes} min</p>
          </div>

          <div className="attendance-table-wrap">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Join Time</th>
                  <th>Leave Time</th>
                  <th>Duration (min)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedSessionReport.students.map((student) => (
                  <tr key={`${student.user_id}-${student.join_time}`}>
                    <td>{student.student_name}</td>
                    <td>{formatDateTime(student.join_time)}</td>
                    <td>{student.leave_time ? formatDateTime(student.leave_time) : "Not left yet"}</td>
                    <td>{student.duration_minutes}</td>
                    <td>{student.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AttendanceCard>
      ) : null}
    </>
  );
}

function StudentReportView({ report }) {
  if (!report) {
    return (
      <div className="attendance-empty">
        <h3>No attendance report found</h3>
        <p>Your attendance history will appear here after you join sessions.</p>
      </div>
    );
  }

  return (
    <>
      <section className="attendance-stats-grid" aria-label="Student report summary">
        <AttendanceStatsCard label="Sessions Attended" value={report.total_sessions_attended} tone="present" />
        <AttendanceStatsCard label="Sessions Missed" value={report.total_sessions_missed} tone="absent" />
        <AttendanceStatsCard
          label="Attendance Percentage"
          value={`${report.attendance_percentage}%`}
          tone="percentage"
        />
        <AttendanceStatsCard
          label="Total Duration"
          value={`${report.total_duration_minutes} min`}
        />
      </section>

      <AttendanceCard title={`Sessions for ${report.student_name}`} meta={`${report.sessions.length} records`}>
        <div className="attendance-table-wrap">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Join Time</th>
                <th>Leave Time</th>
                <th>Duration (min)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.map((session) => (
                <tr key={`${session.session_id}-${session.join_time}`}>
                  <td>{session.session_name}</td>
                  <td>{formatDateTime(session.join_time)}</td>
                  <td>{session.leave_time ? formatDateTime(session.leave_time) : "Not left yet"}</td>
                  <td>{session.duration_minutes}</td>
                  <td>{session.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AttendanceCard>
    </>
  );
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default AttendanceReports;