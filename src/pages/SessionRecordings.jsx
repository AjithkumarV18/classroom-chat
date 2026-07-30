import React, { useEffect, useMemo, useState } from "react";
import { getAuthUser } from "../auth/auth";
import { recordingsApi, toApiUrl } from "../services/api";
import "./SessionRecordings.css";

function SessionRecordings() {
  const authUser = getAuthUser();
  const canManageRecordings = ["Teacher", "Admin"].includes(authUser?.role);
  const [recordings, setRecordings] = useState([]);
  const [playingRecording, setPlayingRecording] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSessionRecordings();
  }, []);

  const sortedRecordings = useMemo(() => {
    return [...recordings].sort(
      (firstRecording, secondRecording) =>
        new Date(secondRecording.uploadedAt) - new Date(firstRecording.uploadedAt)
    );
  }, [recordings]);

  const loadSessionRecordings = async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const response = await recordingsApi.list();
      const items = Array.isArray(response) ? response : response.items || [];
      setRecordings(items.map(mapSessionRecordingFromApi));
    } catch (error) {
      setErrorMessage(error.message || "Unable to load session recordings.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayRecording = async (recording) => {
    if (!recording.videoUrl) {
      setErrorMessage("This recording does not have a playable video file. Upload it again with a video file.");
      return;
    }

    try {
      setErrorMessage("");
      const playback = await recordingsApi.playback(recording.id);
      setPlayingRecording({ ...recording, videoUrl: playback.playback_url });
      await recordingsApi.trackView(recording.id, { watch_duration_seconds: 0 });
      setStatusMessage(`Playing recording ${recording.id} for ${recording.sessionName}.`);
    } catch (error) {
      setErrorMessage(error.message || "Unable to start playback.");
    }
  };

  const handleDownloadRecording = async (recording) => {
    if (!recording.downloadUrl) {
      setErrorMessage("This recording does not have a downloadable video file. Upload it again with a video file.");
      return;
    }

    try {
      setErrorMessage("");
      const blob = await recordingsApi.download(recording.id);
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = recording.videoFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setStatusMessage(`Downloaded recording ${recording.id}.`);
    } catch (error) {
      setErrorMessage(error.message || "Unable to download recording.");
    }
  };

  const handleDeleteRecording = async (recording) => {
    try {
      setErrorMessage("");
      await recordingsApi.delete(recording.id);
      setRecordings((currentRecordings) =>
        currentRecordings.filter((item) => item.objectId !== recording.objectId)
      );

      if (playingRecording?.objectId === recording.objectId) {
        setPlayingRecording(null);
      }

      setStatusMessage(`Recording ${recording.id} deleted successfully from MongoDB.`);
    } catch (error) {
      setErrorMessage(error.message || "Unable to delete session recording.");
    }
  };

  return (
    <main className="session-recordings-page">
      <section className="session-recordings-shell" aria-label="Session recordings page">
        <header className="session-recordings-header">
          <div>
            <p>Session Library</p>
            <h1>Session Recordings</h1>
            <span>
              {canManageRecordings
                ? "Play, download, or remove recorded classroom sessions."
                : "Play or download recordings available to your batch."}
            </span>
          </div>
        </header>

        {errorMessage ? <p className="recording-status recording-status--error">{errorMessage}</p> : null}

        {statusMessage ? (
          <p className="recording-status" role="status">
            {statusMessage}
          </p>
        ) : null}

        {playingRecording ? (
          <section className="playback-panel" aria-label="Video playback">
            <div className="playback-screen playback-screen--video">
              <div className="playback-screen__header">
                <span>Now Playing</span>
                <strong>{playingRecording.id}</strong>
              </div>
              <video controls src={toApiUrl(playingRecording.videoUrl)}>
                Your browser does not support video playback.
              </video>
            </div>
          </section>
        ) : null}

        <section className="session-recordings-panel" aria-labelledby="recording-cards-title">
          <div className="session-recordings-panel__titlebar">
            <div>
              <h2 id="recording-cards-title">Recording Cards</h2>
              <p>Each card is loaded from the session_recordings MongoDB collection.</p>
            </div>
          </div>

          <div className="session-recordings-list">
            {isLoading ? (
              <div className="session-recordings-empty">
                <h3>Loading session recordings</h3>
                <p>Please wait while data loads from MongoDB.</p>
              </div>
            ) : sortedRecordings.length > 0 ? (
              sortedRecordings.map((recording) => (
                <article className="session-recording-card" key={recording.objectId}>
                  <div className="session-recording-card__content">
                    <span className="session-recording-card__eyebrow">Recording ID</span>
                    <h3>{recording.id}</h3>
                    <dl>
                      <div>
                        <dt>Session Name</dt>
                        <dd>{recording.sessionName}</dd>
                      </div>
                      <div>
                        <dt>Duration</dt>
                        <dd>{recording.duration}</dd>
                      </div>
                      <div>
                        <dt>Uploaded Date</dt>
                        <dd>{formatUploadedDate(recording.uploadedAt)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="session-recording-card__actions">
                    <button
                      className="play-recording-button"
                      onClick={() => handlePlayRecording(recording)}
                      type="button"
                    >
                      Play Recording
                    </button>
                    <button
                      className="download-recording-button"
                      disabled={!recording.downloadUrl}
                      onClick={() => handleDownloadRecording(recording)}
                      type="button"
                    >
                      Download
                    </button>
                    {canManageRecordings ? (
                      <button
                        className="delete-recording-button"
                        onClick={() => handleDeleteRecording(recording)}
                        type="button"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="session-recordings-empty">
                <h3>No session recordings available</h3>
                <p>Upload a recording from the Recordings page to save one in MongoDB.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function mapSessionRecordingFromApi(recording) {
  return {
    objectId: recording.id,
    id: recording.recording_id,
    sessionName: recording.session_name || recording.session_id,
    duration: recording.duration || recording.recording_duration,
    videoUrl: recording.video_url || recording.video_file_url,
    downloadUrl: recording.download_enabled === false ? "" : (recording.download_url || recording.video_file_url || recording.video_url),
    videoFileName: recording.video_file_name || recording.video_file_url?.split("/").pop() || "recording",
    uploadedAt: recording.uploaded_date || recording.recording_date || recording.created_at,
  };
}

function formatUploadedDate(uploadedAt) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(uploadedAt));
}

export default SessionRecordings;
