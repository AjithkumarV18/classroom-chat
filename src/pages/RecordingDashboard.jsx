import React, { useMemo, useState } from "react";
import UploadRecordingModal from "../components/recordings/UploadRecordingModal";
import "./RecordingDashboard.css";

const initialRecordings = [
  {
    id: "REC-AI1024",
    sessionName: "ROOM-AI2048 - AI Foundations",
    title: "Introduction to AI Concepts",
    videoFileName: "ai-foundations-intro.mp4",
    duration: "42 min",
    uploadedAt: "2026-07-06T09:30:00.000Z",
  },
  {
    id: "REC-ML5481",
    sessionName: "ROOM-ML7312 - Machine Learning",
    title: "Model Training Walkthrough",
    videoFileName: "model-training.mp4",
    duration: "58 min",
    uploadedAt: "2026-07-06T13:00:00.000Z",
  },
];

function RecordingDashboard() {
  const [recordings, setRecordings] = useState(initialRecordings);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const sortedRecordings = useMemo(() => {
    return [...recordings].sort(
      (firstRecording, secondRecording) =>
        new Date(secondRecording.uploadedAt) - new Date(firstRecording.uploadedAt)
    );
  }, [recordings]);

  const handleUploadRecording = (recording) => {
    setRecordings((currentRecordings) => [recording, ...currentRecordings]);
    setIsUploadModalOpen(false);
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
              <p>Each recording shows the mock recording ID, session, video file, and duration.</p>
            </div>
          </div>

          <div className="recordings-list">
            {sortedRecordings.length > 0 ? (
              sortedRecordings.map((recording) => (
                <article className="recording-card" key={recording.id}>
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
                  </div>
                </article>
              ))
            ) : (
              <div className="recordings-empty">
                <h3>No recordings uploaded</h3>
                <p>Use the upload button to add the first recorded session.</p>
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
