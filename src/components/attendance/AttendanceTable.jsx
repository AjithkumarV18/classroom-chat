import React from "react";
import AttendanceRow from "./AttendanceRow";

function AttendanceTable({ records, onViewDetails }) {
  if (records.length === 0) {
    return (
      <div className="attendance-empty">
        <h3>No attendance records found</h3>
        <p>Try changing the search or filter values.</p>
      </div>
    );
  }

  return (
    <div className="attendance-table-wrap">
      <table className="attendance-table">
        <thead>
          <tr>
            <th>Student Name</th>
            <th>Session Name</th>
            <th>Join Time</th>
            <th>Leave Time</th>
            <th>Duration</th>
            <th>Attendance Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <AttendanceRow key={record.id} record={record} onViewDetails={onViewDetails} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AttendanceTable;
