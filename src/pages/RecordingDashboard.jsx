import React, { useEffect, useMemo, useState } from "react";
import UploadRecordingModal from "../components/recordings/UploadRecordingModal";
import { recordingsApi, sessionRecordingsApi, toApiUrl } from "../services/api";
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
      setRecordings(response.map(mapRecordingFromApi));
    } catch (error) {
      setErrorMessage(error.message || "Unable to load recordings.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadRecording = async (recording) => {
    try {
      setErrorMessage("");
      const createdRecording = await recordingsApi.upload({
        recordingId: recording.id,
        sessionName: recording.sessionName,
        title: recording.title,
        duration: recording.duration,
        videoFile: recording.videoFile,
      });

      await sessionRecordingsApi.create({
        recording_id: createdRecording.recording_id,
        session_name: createdRecording.session_name,
        duration: createdRecording.duration,
        video_url: createdRecording.video_url,
        download_url: createdRecording.download_url,
        video_file_name: createdRecording.video_file_name,
      });

      setRecordings((currentRecordings) => [
        mapRecordingFromApi(createdRecording),
        ...currentRecordings,
      ]);
      setIsUploadModalOpen(false);
    } catch (error) {
      setErrorMessage(error.message || "Unable to upload recording.");
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
                      <a href={toApiUrl(recording.downloadUrl)}>Download</a>
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
    sessionName: recording.session_name,
    title: recording.title,
    videoFileName: recording.video_file_name,
    duration: recording.duration,
    videoUrl: recording.video_url,
    downloadUrl: recording.download_url,
    uploadedAt: recording.uploaded_at,
  };
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
