import React, { useEffect, useMemo, useState } from "react";
import UploadRecordingModal from "../components/recordings/UploadRecordingModal";
import { getAuthUser } from "../auth/auth";
import { recordingsApi, sessionRecordingsApi } from "../services/api";
import "./RecordingDashboard.css";

function RecordingDashboard() {
  const [recordings, setRecordings] = useState([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadRecordings();
  }, []);

  const sortedRecordings = useMemo(() => {
    return [...recordings].sort(
      (firstRecording, secondRecording) =>
        new Date(secondRecording.uploadedAt) - new Date(firstRecording.uploadedAt)
    );
  }, [recordings]);

  const loadRecordings = async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const response = await recordingsApi.list();
      const items = Array.isArray(response) ? response : response.items || [];
      setRecordings(items.map(mapRecordingFromApi));
    } catch (error) {
      setErrorMessage(getFriendlyRecordingError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadRecording = async (recording) => {
    try {
      setErrorMessage("");
      const currentUser = getAuthUser();
      const sessionId = getSessionId(recording.sessionName);
      const createdRecording = await recordingsApi.upload({
        sessionId,
        batchId: recording.batchId || "Batch A",
        trainerId: currentUser?.id || "demo-teacher",
        title: recording.title,
        description: `Uploaded from ${recording.sessionName}`,
        duration: recording.duration,
        videoFile: recording.videoFile,
      });

      try {
        await sessionRecordingsApi.create({
          recording_id: createdRecording.recording_id,
          session_name: createdRecording.session_name || createdRecording.session_id,
          duration: createdRecording.duration || createdRecording.recording_duration,
          video_url: createdRecording.video_url || createdRecording.video_file_url,
          download_url: createdRecording.download_url || `/api/recordings/download/${createdRecording.recording_id}`,
          video_file_name: createdRecording.video_file_name || createdRecording.video_file_url?.split("/").pop() || "recording.mp4",
        });
      } catch {
        // The new backend stores playback metadata in recordings; the legacy session_recordings mirror is optional.
      }

      setRecordings((currentRecordings) => [
        mapRecordingFromApi(createdRecording),
        ...currentRecordings,
      ]);
      setIsUploadModalOpen(false);
    } catch (error) {
      setErrorMessage(error.message || "Unable to upload recording.");
    }
  };

  const handleDownloadRecording = async (recording) => {
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
    } catch (error) {
      setErrorMessage(error.message || "Unable to download recording.");
    }
  };

  return (
    <main className="recording-dashboard-page">
      <section className="recording-dashboard-shell" aria-label="Recording management dashboard">
        <header className="recording-dashboard-header">
          <div>
            <p>Recorded Sessions</p>
            <h1>Recording Management Dashboard</h1>
            <span>Upload, review, and organize class recordings for students.</span>
          </div>
          <button
            className="upload-recording-button"
            onClick={() => setIsUploadModalOpen(true)}
            type="button"
          >
            + Upload Recording
          </button>
        </header>

        {errorMessage ? <p className="recording-error">{errorMessage}</p> : null}

        <section className="recording-summary" aria-label="Recording summary">
          <article>
            <span>Total Recordings</span>
            <strong>{recordings.length}</strong>
          </article>
          <article>
            <span>Latest Upload</span>
            <strong>{sortedRecordings[0] ? formatUploadDate(sortedRecordings[0].uploadedAt) : "-"}</strong>
          </article>
        </section>

        <section className="recordings-panel" aria-labelledby="recordings-title">
          <div className="recordings-panel__titlebar">
            <div>
              <h2 id="recordings-title">All Recorded Sessions</h2>
              <p>Each recording is loaded from MongoDB through the backend.</p>
            </div>
          </div>

          <div className="recordings-list">
            {isLoading ? (
              <div className="recordings-empty">
                <h3>Loading recordings</h3>
                <p>Please wait while data loads from MongoDB.</p>
              </div>
            ) : sortedRecordings.length > 0 ? (
              sortedRecordings.map((recording) => (
                <article className="recording-card" key={recording.objectId}>
                  <div className="recording-card__content">
                    <span className="recording-card__eyebrow">Recording ID</span>
                    <h3>{recording.id}</h3>
                    <dl>
                      <div>
                        <dt>Recording Title</dt>
                        <dd>{recording.title}</dd>
                      </div>
                      <div>
                        <dt>Session</dt>
                        <dd>{recording.sessionName}</dd>
                      </div>
                      <div>
                        <dt>Video File</dt>
                        <dd>{recording.videoFileName}</dd>
                      </div>
                      <div>
                        <dt>Duration</dt>
                        <dd>{recording.duration}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="recording-card__meta">
                    <span>Uploaded</span>
                    <strong>{formatUploadDateTime(recording.uploadedAt)}</strong>
                    {recording.downloadUrl ? (
                      <button type="button" onClick={() => handleDownloadRecording(recording)}>
                        Download
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="recordings-empty">
                <h3>No recordings uploaded</h3>
                <p>Use the upload button to save the first recording in MongoDB.</p>
              </div>
            )}
          </div>
        </section>
      </section>

      <UploadRecordingModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadRecording={handleUploadRecording}
      />
    </main>
  );
}

function mapRecordingFromApi(recording) {
  return {
    objectId: recording.id,
    id: recording.recording_id,
    sessionName: recording.session_name || recording.session_id,
    title: recording.title || recording.recording_title,
    videoFileName: recording.video_file_name || recording.video_file_url?.split("/").pop() || "Stored recording",
    duration: recording.duration || recording.recording_duration,
    videoUrl: recording.video_url || recording.video_file_url,
    downloadUrl: recording.download_url || `/api/recordings/download/${recording.recording_id}`,
    uploadedAt: recording.uploaded_at || recording.recording_date || recording.created_at,
  };
}

function getSessionId(sessionName) {
  return sessionName.includes(" - ") ? sessionName.split(" - ")[0] : sessionName;
}

function getFriendlyRecordingError(error) {
  if (error.message === "Failed to fetch") {
    return "Backend is not reachable. Start FastAPI on http://localhost:8000, then refresh this page.";
  }
  return error.message || "Unable to load recordings.";
}

function formatUploadDate(uploadedAt) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(uploadedAt));
}

function formatUploadDateTime(uploadedAt) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(uploadedAt));
}

export default RecordingDashboard;
