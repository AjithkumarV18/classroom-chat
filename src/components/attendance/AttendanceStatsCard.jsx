import React from "react";

function AttendanceStatsCard({ label, value, tone = "default", helper }) {
  return (
    <article className={`attendance-stats-card attendance-stats-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </article>
  );
}

export default AttendanceStatsCard;
