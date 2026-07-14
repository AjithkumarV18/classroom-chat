import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAuthUser } from "../auth/auth";
import { attendanceApi, managedSessionsApi } from "../services/api";
import AttendanceCard from "../components/attendance/AttendanceCard";
import AttendanceDetailsModal from "../components/attendance/AttendanceDetailsModal";
import AttendanceFilters from "../components/attendance/AttendanceFilters";
import AttendanceStatsCard from "../components/attendance/AttendanceStatsCard";
import AttendanceTable from "../components/attendance/AttendanceTable";
import "./Attendance.css";

const initialFilters = {
  search: "",
  sessionId: "All",
  status: "All",
  date: "",
};

const demoStudentNames = {
  "demo-student": "Demo Student",
};

function Attendance() {
  const authUser = getAuthUser();
  const userRole = authUser?.role || "";
  const isStudent = userRole === "Student";
  const [records, setRecords] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadAttendance();
  }, []);

  const filteredRecords = useMemo(() => {
    const searchValue = filters.search.trim().toLowerCase();

    return records.filter((record) => {
      const matchesSearch =
        !searchValue || record.studentName.toLowerCase().includes(searchValue);
      const matchesSession =
        filters.sessionId === "All" || record.sessionId === filters.sessionId;
      const matchesStatus =
        filters.status === "All" || record.status === filters.status;
      const matchesDate = !filters.date || record.dateValue === filters.date;

      return matchesSearch && matchesSession && matchesStatus && matchesDate;
    });
  }, [records, filters]);

  const filterSessions = useMemo(() => {
    if (sessions.length > 0) return sessions;

    const sessionMap = new Map();
    records.forEach((record) => {
      if (!sessionMap.has(record.sessionId)) {
        sessionMap.set(record.sessionId, {
          sessionId: record.sessionId,
          sessionName: record.sessionName,
        });
      }
    });

    return Array.from(sessionMap.values());
  }, [records, sessions]);

  const stats = useMemo(() => {
    const totalStudents = new Set(filteredRecords.map((record) => record.userId)).size;
    const present = filteredRecords.filter((record) =>
      ["Present", "Late", "Left"].includes(record.status)
    ).length;
    const absent = filteredRecords.filter((record) => record.status === "Absent").length;
    const percentage = filteredRecords.length
      ? Math.round((present / filteredRecords.length) * 100)
      : 0;

    return {
      totalStudents,
      present,
      absent,
      percentage,
    };
  }, [filteredRecords]);

  const loadAttendance = async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");

      if (isStudent) {
        const studentId = authUser?.id || authUser?.user_id || "demo-student";
        const studentRecords = await attendanceApi.listByStudent(studentId);
        setSessions([]);
        setRecords(studentRecords.map((record) => mapAttendanceRecord(record)));
        return;
      }

      const sessionResponse = await managedSessionsApi.list();
      const mappedSessions = sessionResponse.map(mapSessionFromApi);
      setSessions(mappedSessions);

      if (mappedSessions.length === 0) {
        setRecords([]);
        return;
      }

      const attendanceResponses = await Promise.all(
        mappedSessions.map(async (session) => {
          try {
            const sessionRecords = await attendanceApi.listBySession(session.sessionId);
            return sessionRecords.map((record) => mapAttendanceRecord(record, session));
          } catch {
            return [];
          }
        })
      );

      setRecords(attendanceResponses.flat());
    } catch (error) {
      setErrorMessage(error.message || "Unable to load attendance records.");
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }));
  };

  return (
    <main className="attendance-page">
      <section className="attendance-shell" aria-label="Attendance management">
        <header className="attendance-header">
          <div>
            <p>Attendance Management</p>
            <h1>Class Attendance Monitor</h1>
            <span>
              {isStudent
                ? "View your attendance records for virtual classroom sessions."
                : "Monitor student participation across virtual classroom sessions."}
            </span>
          </div>
          <Link to={isStudent ? "/virtual-classroom" : "/session-management"}>
            {isStudent ? "Open Classroom" : "Manage Sessions"}
          </Link>
        </header>

        {errorMessage ? <p className="attendance-error">{errorMessage}</p> : null}

        <section className="attendance-stats-grid" aria-label="Attendance statistics">
          <AttendanceStatsCard label="Total Students" value={stats.totalStudents} helper="Unique students shown" />
          <AttendanceStatsCard label="Present" value={stats.present} tone="present" helper="Present, late, or left" />
          <AttendanceStatsCard label="Absent" value={stats.absent} tone="absent" helper="Marked absent" />
          <AttendanceStatsCard label="Attendance Percentage" value={`${stats.percentage}%`} tone="percentage" helper="Based on filtered rows" />
        </section>

        <AttendanceCard title="Attendance Records" meta={`${filteredRecords.length} shown`}>
          <AttendanceFilters
            filters={filters}
            onChange={handleFilterChange}
            onClear={() => setFilters(initialFilters)}
            sessions={filterSessions}
          />

          {isLoading ? (
            <div className="attendance-loading">
              <span aria-hidden="true" />
              <p>Loading attendance records...</p>
            </div>
          ) : (
            <AttendanceTable records={filteredRecords} onViewDetails={setSelectedRecord} />
          )}
        </AttendanceCard>
      </section>

      <AttendanceDetailsModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </main>
  );
}

function mapSessionFromApi(session) {
  return {
    sessionId: session.session_id,
    sessionName: session.session_name,
    date: session.date,
    time: session.time,
    duration: session.duration,
  };
}

function mapAttendanceRecord(record, session = null) {
  const joinDate = record.join_time ? new Date(record.join_time) : null;
  const leaveDate = record.leave_time ? new Date(record.leave_time) : null;
  const status = normalizeStatus(record.status);

  return {
    id: record.id,
    userId: record.user_id,
    studentName: record.student_name || record.user_name || demoStudentNames[record.user_id] || record.user_id,
    sessionId: record.session_id,
    sessionName: record.session_name || session?.sessionName || record.session_id,
    joinTimeLabel: formatDateTime(joinDate),
    leaveTimeLabel: leaveDate ? formatDateTime(leaveDate) : "Not left yet",
    durationLabel: formatDuration(record.duration_seconds),
    status,
    dateValue: joinDate ? toDateInputValue(joinDate) : session?.date || "",
  };
}

function normalizeStatus(status) {
  return status || "Absent";
}

function formatDateTime(value) {
  if (!value || Number.isNaN(value.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDuration(seconds = 0) {
  if (!seconds) return "0 min";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes} min ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min`;
}

function toDateInputValue(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default Attendance;
