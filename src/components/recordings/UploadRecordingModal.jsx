import React, { useEffect, useState } from "react";
import "./UploadRecordingModal.css";

const sessionOptions = [
  "ROOM-AI2048 - AI Foundations",
  "ROOM-ML7312 - Machine Learning",
  "ROOM-PY4401 - Python for AI",
  "ROOM-DS9027 - Data Science Essentials",
];

const initialForm = {
  sessionName: "",
  recordingTitle: "",
  videoFile: null,
  duration: "",
};

function UploadRecordingModal({ isOpen, onClose, onUploadRecording }) {
  const [formValues, setFormValues] = useState(initialForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      setFormValues(initialForm);
      setErrors({});
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleChange = (event) => {
    const { name, value, files } = event.target;
    const nextValue = name === "videoFile" ? files?.[0] || null : value;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: nextValue,
    }));

    if (errors[name]) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        [name]: "",
      }));
    }
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!formValues.sessionName) {
      nextErrors.sessionName = "Please select a session.";
    }

    if (!formValues.recordingTitle.trim()) {
      nextErrors.recordingTitle = "Recording title is required.";
    }

    if (!formValues.videoFile) {
      nextErrors.videoFile = "Please upload a video file.";
    }

    if (!formValues.duration.trim()) {
      nextErrors.duration = "Duration is required.";
    }

    return nextErrors;
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const nextErrors = validateForm();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onUploadRecording({
      id: generateRecordingId(),
      sessionName: formValues.sessionName,
      title: formValues.recordingTitle.trim(),
      videoFileName: formValues.videoFile.name,
      duration: formValues.duration.trim(),
      uploadedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="recording-modal-overlay" role="presentation">
      <section
        aria-labelledby="upload-recording-title"
        aria-modal="true"
        className="recording-modal"
        role="dialog"
      >
        <div className="recording-modal__header">
          <div>
            <p>Recording Library</p>
            <h2 id="upload-recording-title">Upload Recording</h2>
          </div>
          <button
            aria-label="Close upload recording modal"
            className="recording-modal__close"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <form className="recording-modal__form" onSubmit={handleSubmit} noValidate>
          <label className="recording-field" htmlFor="sessionName">
            <span>Session Dropdown</span>
            <select
              aria-describedby={errors.sessionName ? "sessionName-error" : undefined}
              aria-invalid={Boolean(errors.sessionName)}
              id="sessionName"
              name="sessionName"
              onChange={handleChange}
              value={formValues.sessionName}
            >
              <option value="">Choose recorded session</option>
              {sessionOptions.map((sessionName) => (
                <option key={sessionName} value={sessionName}>
                  {sessionName}
                </option>
              ))}
            </select>
            <small id="sessionName-error">{errors.sessionName}</small>
          </label>

          <label className="recording-field" htmlFor="recordingTitle">
            <span>Recording Title</span>
            <input
              aria-describedby={errors.recordingTitle ? "recordingTitle-error" : undefined}
              aria-invalid={Boolean(errors.recordingTitle)}
              id="recordingTitle"
              name="recordingTitle"
              onChange={handleChange}
              placeholder="Enter recording title"
              type="text"
              value={formValues.recordingTitle}
            />
            <small id="recordingTitle-error">{errors.recordingTitle}</small>
          </label>

          <label className="recording-field" htmlFor="videoFile">
            <span>Upload Video</span>
            <input
              accept="video/*"
              aria-describedby={errors.videoFile ? "videoFile-error" : undefined}
              aria-invalid={Boolean(errors.videoFile)}
              id="videoFile"
              name="videoFile"
              onChange={handleChange}
              type="file"
            />
            <small id="videoFile-error">{errors.videoFile}</small>
          </label>

          <label className="recording-field" htmlFor="duration">
            <span>Duration</span>
            <input
              aria-describedby={errors.duration ? "duration-error" : undefined}
              aria-invalid={Boolean(errors.duration)}
              id="duration"
              name="duration"
              onChange={handleChange}
              placeholder="Example: 45 min"
              type="text"
              value={formValues.duration}
            />
            <small id="duration-error">{errors.duration}</small>
          </label>

          <div className="recording-modal__actions">
            <button className="recording-modal__secondary" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="recording-modal__primary" type="submit">
              Upload
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function generateRecordingId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `REC-${randomPart}`;
}

export default UploadRecordingModal;
