import React from "react";

function AttendanceCard({ title, meta, actions, children }) {
  return (
    <section className="attendance-card">
      <div className="attendance-card__header">
        <div>
          <h2>{title}</h2>
          {meta ? <span>{meta}</span> : null}
        </div>
        {actions ? <div className="attendance-card__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export default AttendanceCard;
