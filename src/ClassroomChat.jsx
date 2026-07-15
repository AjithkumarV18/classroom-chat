import { useEffect, useMemo, useRef, useState } from "react";
import { getAuthUser } from "./auth/auth";
import { chatApi } from "./services/api";

const refreshMs = 3000;

export default function ClassroomChat({ sessionId = "SESSION" }) {
  const authUser = getAuthUser();
  const canDelete = ["Teacher", "Admin"].includes(authUser?.role);
  const messageFeedRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const senderName = useMemo(() => {
    if (!authUser) return "Guest";
    const fullName = `${authUser.first_name || ""} ${authUser.last_name || ""}`.trim();
    return fullName || authUser.email || authUser.id || "User";
  }, [authUser]);

  useEffect(() => {
    loadMessages();
    const timer = window.setInterval(loadMessages, refreshMs);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    if (!messageFeedRef.current) return;
    messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight;
  }, [messages.length]);

  const loadMessages = async () => {
    try {
      setErrorMessage("");
      const response = await chatApi.listBySession(sessionId);
      setMessages(response.map(mapMessageFromApi));
    } catch (error) {
      setErrorMessage(error.message || "Unable to load chat messages.");
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage || isSending) return;

    if (!authUser?.id) {
      setErrorMessage("Please login again before sending a message.");
      return;
    }

    try {
      setIsSending(true);
      setErrorMessage("");
      const createdMessage = await chatApi.send({
        session_id: sessionId,
        sender_id: authUser.id,
        sender_name: senderName,
        message: trimmedMessage,
        message_type: "Text",
      });

      setMessages((currentMessages) => [
        ...currentMessages,
        mapMessageFromApi(createdMessage),
      ]);
      setInputValue("");
    } catch (error) {
      setErrorMessage(error.message || "Unable to send message.");
    } finally {
      setIsSending(false);
    }
  };

  const deleteMessage = async (message) => {
    try {
      setErrorMessage("");
      await chatApi.delete(message.messageId);
      setMessages((currentMessages) =>
        currentMessages.filter((item) => item.messageId !== message.messageId)
      );
    } catch (error) {
      setErrorMessage(error.message || "Unable to delete message.");
    }
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
          <span>Session: {sessionId}</span>
          <span>{isLoading ? "Loading..." : `Total Messages: ${messages.length}`}</span>
        </div>

        {errorMessage ? <div style={styles.errorBox}>{errorMessage}</div> : null}

        <div style={styles.messageFeed} ref={messageFeedRef}>
          {!isLoading && messages.length === 0 ? (
            <div style={styles.emptyState}>No messages yet. Start the discussion.</div>
          ) : null}

          {messages.map((message) => {
            const isOwnMessage = message.senderId === authUser?.id;

            return (
              <div
                key={message.messageId}
                style={{
                  ...styles.messageBubble,
                  alignSelf: isOwnMessage ? "flex-end" : "flex-start",
                  backgroundColor: isOwnMessage ? "#2563eb" : "#ffffff",
                  color: isOwnMessage ? "#ffffff" : "#17202a",
                }}
              >
                <div style={styles.messageMeta}>
                  <strong>{message.senderName}</strong>
                  <span>{message.timeLabel}</span>
                </div>
                <div>{message.message}</div>
                {canDelete ? (
                  <button
                    onClick={() => deleteMessage(message)}
                    style={{
                      ...styles.deleteButton,
                      color: isOwnMessage ? "#ffffff" : "#c73d4a",
                      borderColor: isOwnMessage ? "rgba(255,255,255,0.5)" : "rgba(199,61,74,0.35)",
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <div style={styles.controls}>
          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            maxLength={1000}
            style={styles.input}
          />

          <button disabled={isSending} type="button" onClick={sendMessage} style={styles.button}>
            {isSending ? "Sending" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function mapMessageFromApi(message) {
  return {
    id: message.id,
    messageId: message.message_id,
    sessionId: message.session_id,
    senderId: message.sender_id,
    senderName: message.sender_name,
    message: message.message,
    messageType: message.message_type,
    timeLabel: formatTime(message.timestamp),
  };
}

function formatTime(timestamp) {
  const value = timestamp ? new Date(timestamp) : null;
  if (!value || Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
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

  errorBox: {
    flex: "0 0 auto",
    marginBottom: "10px",
    border: "1px solid rgba(199,61,74,0.24)",
    borderRadius: "8px",
    padding: "9px 10px",
    backgroundColor: "rgba(199,61,74,0.08)",
    color: "#c73d4a",
    fontSize: "0.86rem",
    fontWeight: "bold",
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

  emptyState: {
    margin: "auto",
    color: "#64748b",
    fontWeight: "bold",
    textAlign: "center",
  },

  messageBubble: {
    maxWidth: "82%",
    padding: "11px 13px",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    wordBreak: "break-word",
    lineHeight: 1.4,
  },

  messageMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "5px",
    fontSize: "0.82rem",
    opacity: 0.86,
  },

  deleteButton: {
    marginTop: "8px",
    border: "1px solid",
    borderRadius: "8px",
    padding: "5px 8px",
    backgroundColor: "transparent",
    font: "inherit",
    fontSize: "0.78rem",
    fontWeight: "bold",
    cursor: "pointer",
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
