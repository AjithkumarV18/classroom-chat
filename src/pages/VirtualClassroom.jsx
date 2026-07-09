import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./VirtualClassroom.css";

function VirtualClassroom() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId") || "SESSION";
  const [messages, setMessages] = useState([
    { sender: "System", text: `Joined virtual classroom ${sessionId}.` },
  ]);
  const [messageText, setMessageText] = useState("");

  const sendMessage = () => {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      { sender: "You", text: trimmedMessage },
    ]);
    setMessageText("");
  };

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
          <h2>Class Chat</h2>
          <div className="virtual-chat__messages">
            {messages.map((message, index) => (
              <article key={`${message.sender}-${index}`}>
                <strong>{message.sender}</strong>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
          <div className="virtual-chat__controls">
            <input
              onChange={(event) => setMessageText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendMessage();
              }}
              placeholder="Type message"
              type="text"
              value={messageText}
            />
            <button onClick={sendMessage} type="button">Send</button>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default VirtualClassroom;
