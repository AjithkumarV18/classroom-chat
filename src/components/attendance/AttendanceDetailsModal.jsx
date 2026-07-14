import React from "react";

function AttendanceDetailsModal({ record, onClose }) {
  if (!record) return null;

  return (
    <div className="attendance-modal-backdrop" role="presentation">
      <section className="attendance-modal" aria-modal="true" role="dialog">
        <header>
          <div>
            <p>Attendance Details</p>
            <h2>{record.studentName}</h2>
          </div>
          <button aria-label="Close attendance details" onClick={onClose} type="button">
            x
          </button>
        </header>

        <div className="attendance-modal__grid">
          <div>
            <span>Student Information</span>
            <strong>{record.studentName}</strong>
            <p>User ID: {record.userId}</p>
          </div>
          <div>
            <span>Session Information</span>
            <strong>{record.sessionName}</strong>
            <p>Session ID: {record.sessionId}</p>
          </div>
          <div>
            <span>Join Time</span>
            <strong>{record.joinTimeLabel}</strong>
          </div>
          <div>
            <span>Leave Time</span>
            <strong>{record.leaveTimeLabel}</strong>
          </div>
          <div>
            <span>Total Duration</span>
            <strong>{record.durationLabel}</strong>
          </div>
          <div>
            <span>Attendance Status</span>
            <strong>
              <span className={`attendance-status attendance-status--${record.status.toLowerCase()}`}>
                {record.status}
              </span>
            </strong>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AttendanceDetailsModal;
