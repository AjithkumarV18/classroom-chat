import React from "react";

function AttendanceRow({ record, onViewDetails }) {
  return (
    <tr>
      <td>{record.studentName}</td>
      <td>{record.sessionName}</td>
      <td>{record.joinTimeLabel}</td>
      <td>{record.leaveTimeLabel}</td>
      <td>{record.durationLabel}</td>
      <td>
        <span className={`attendance-status attendance-status--${record.status.toLowerCase()}`}>
          {record.status}
        </span>
      </td>
      <td>
        <button className="attendance-view-button" onClick={() => onViewDetails(record)} type="button">
          View Details
        </button>
      </td>
    </tr>
  );
}

export default AttendanceRow;
