import { useState } from "react";

export default function ClassroomChat() {
  const [messages, setMessages] = useState([
    {
      sender: "Trainer",
      text: "Welcome to class! Ask a question whenever you are ready.",
    },
  ]);

  const [inputValue, setInputValue] = useState("");

  const sendMessage = () => {
    const trimmedMessage = inputValue.trim();

    if (!trimmedMessage) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        sender: "You",
        text: trimmedMessage,
      },
    ]);

    setInputValue("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.chatShell}>
        <h2 style={styles.heading}>Classroom Chat</h2>

        <div style={styles.statusBar}>
          <span>Trainer Online</span>
          <span>Total Messages: {messages.length}</span>
        </div>

        <div style={styles.messageFeed}>
          {messages.map((message, index) => (
            <div
              key={index}
              style={{
                ...styles.messageBubble,
                alignSelf: message.sender === "You" ? "flex-end" : "flex-start",
                backgroundColor: message.sender === "You" ? "#2563eb" : "#ffffff",
                color: message.sender === "You" ? "#ffffff" : "#17202a",
              }}
            >
              <strong>{message.sender}</strong>
              <div>{message.text}</div>
            </div>
          ))}
        </div>

        <div style={styles.controls}>
          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            style={styles.input}
          />

          <button type="button" onClick={sendMessage} style={styles.button}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    height: "100%",
    minHeight: 0,
    display: "flex",
    background: "transparent",
    padding: 0,
  },

  chatShell: {
    width: "100%",
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    padding: "18px",
  },

  heading: {
    flex: "0 0 auto",
    textAlign: "left",
    margin: "0 0 14px",
    color: "#1e40af",
    fontSize: "1.35rem",
    lineHeight: 1.2,
  },

  statusBar: {
    flex: "0 0 auto",
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "14px",
    padding: "10px",
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    fontWeight: "bold",
    color: "#475569",
    fontSize: "0.86rem",
  },

  messageFeed: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "12px",
    backgroundColor: "#f1f5f9",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
  },

  messageBubble: {
    maxWidth: "82%",
    padding: "11px 13px",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    wordBreak: "break-word",
    lineHeight: 1.4,
  },

  controls: {
    flex: "0 0 auto",
    display: "flex",
    gap: "8px",
    marginTop: "14px",
  },

  input: {
    minWidth: 0,
    flex: 1,
    padding: "11px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "0.95rem",
    outline: "none",
  },

  button: {
    flex: "0 0 auto",
    padding: "0 14px",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontSize: "0.95rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
};
