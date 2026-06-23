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
        <h2 style={styles.heading}>💬 Classroom Chat</h2>

        <div style={styles.statusBar}>
          <span>🟢 Trainer Online</span>
          <span>Total Messages: {messages.length}</span>
        </div>

        <div style={styles.messageFeed}>
          {messages.map((message, index) => (
            <div
              key={index}
              style={{
                ...styles.messageBubble,
                alignSelf:
                  message.sender === "You"
                    ? "flex-end"
                    : "flex-start",

                backgroundColor:
                  message.sender === "You"
                    ? "#2563eb"
                    : "#ffffff",

                color:
                  message.sender === "You"
                    ? "#ffffff"
                    : "#000000",
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

          <button
            type="button"
            onClick={sendMessage}
            style={styles.button}
          >
            ➤ Send
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background:
      "linear-gradient(135deg, #dbeafe, #eff6ff)",
    padding: "20px",
  },

  chatShell: {
    width: "100%",
    maxWidth: "650px",
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 15px 35px rgba(0,0,0,0.15)",
  },

  heading: {
    textAlign: "center",
    marginBottom: "15px",
    color: "#1e40af",
  },

  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "15px",
    padding: "10px",
    backgroundColor: "#f8fafc",
    borderRadius: "10px",
    fontWeight: "bold",
    color: "#475569",
  },

  messageFeed: {
    height: "350px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "15px",
    backgroundColor: "#f1f5f9",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
  },

  messageBubble: {
    maxWidth: "75%",
    padding: "12px 15px",
    borderRadius: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    wordWrap: "break-word",
  },

  controls: {
    display: "flex",
    gap: "10px",
    marginTop: "15px",
  },

  input: {
    flex: 1,
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    fontSize: "16px",
    outline: "none",
  },

  button: {
    padding: "12px 20px",
    border: "none",
    borderRadius: "10px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
  },
};