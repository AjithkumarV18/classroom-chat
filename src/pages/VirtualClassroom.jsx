import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import ClassroomChat from "../ClassroomChat";
import "./VirtualClassroom.css";

function VirtualClassroom() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId") || "SESSION";

  return (
    <main className="virtual-classroom-page">
      <header className="virtual-classroom-header">
        <div>
          <p>Virtual Classroom</p>
          <h1>{sessionId}</h1>
          <span>Live class room with video area, whiteboard space, and class chat.</span>
        </div>
        <Link to="/session-management">Back to Sessions</Link>
      </header>

      <section className="virtual-classroom-grid">
        <section className="virtual-video-area" aria-label="Virtual classroom video area">
          <div className="virtual-video-tile virtual-video-tile--trainer">
            <span>Trainer</span>
            <strong>Camera Preview</strong>
          </div>
          <div className="virtual-video-tile">
            <span>Students</span>
            <strong>Participants Waiting</strong>
          </div>
        </section>

        <section className="virtual-whiteboard" aria-label="Virtual classroom whiteboard">
          <div>
            <p>Whiteboard</p>
            <h2>Live Collaboration Board</h2>
            <span>Use the full classroom page for drawing tools and saved whiteboard work.</span>
            <Link to={`/classroom?sessionId=${encodeURIComponent(sessionId)}`}>Open Whiteboard</Link>
          </div>
        </section>

        <aside className="virtual-chat" aria-label="Virtual classroom chat">
          <ClassroomChat sessionId={sessionId} />
        </aside>
      </section>
    </main>
  );
}

export default VirtualClassroom;

