import { useMemo } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";

const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN || "meet.jit.si";

function sanitizeRoomName(sessionId) {
  const safe = String(sessionId || "session")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `classroom-${safe || "session"}`;
}

export default function JitsiVideoRoom({ sessionId, displayName, email }) {
  const roomName = useMemo(() => sanitizeRoomName(sessionId), [sessionId]);

  return (
    <div className="jitsi-video-room">
      <JitsiMeeting
        domain={JITSI_DOMAIN}
        roomName={roomName}
        userInfo={{
          displayName: displayName || "Guest",
          email: email || "",
        }}
        configOverwrite={{
          startWithAudioMuted: true,
          startWithVideoMuted: false,
          prejoinPageEnabled: true,
          disableDeepLinking: true,
          enableWelcomePage: false,
          hideConferenceSubject: false,
          subject: sessionId,
          toolbarButtons: [
            "microphone",
            "camera",
            "desktop",
            "fullscreen",
            "hangup",
            "chat",
            "raisehand",
            "participants-pane",
            "tileview",
            "settings",
          ],
        }}
        interfaceConfigOverwrite={{
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          MOBILE_APP_PROMO: false,
          DEFAULT_BACKGROUND: "#1a1d24",
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
        }}
        getIFrameRef={(iframeRef) => {
          if (iframeRef) {
            iframeRef.style.height = "100%";
            iframeRef.style.width = "100%";
            iframeRef.style.border = "0";
          }
        }}
      />
    </div>
  );
}
