import React, { useEffect, useState } from "react";
import "./CreateSessionModal.css";

const batchOptions = [
  "AI Foundations - Batch A",
  "Machine Learning - Batch B",
  "Python for AI - Batch C",
  "Data Science Essentials - Batch D",
];

const initialForm = {
  batchName: "",
  sessionDate: "",
  sessionTime: "",
};

function CreateSessionModal({ isOpen, onClose, onCreateSession }) {
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
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
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

    if (!formValues.batchName) {
      nextErrors.batchName = "Please select a batch.";
    }

    if (!formValues.sessionDate) {
      nextErrors.sessionDate = "Please select a session date.";
    }

    if (!formValues.sessionTime) {
      nextErrors.sessionTime = "Please select a session time.";
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

    onCreateSession({
      id: generateSessionId(),
      batchName: formValues.batchName,
      sessionDate: formValues.sessionDate,
      sessionTime: formValues.sessionTime,
      studentsNotified: false,
    });
  };

  return (
    <div className="session-modal-overlay" role="presentation">
      <section
        aria-labelledby="create-session-title"
        aria-modal="true"
        className="session-modal"
        role="dialog"
      >
        <div className="session-modal__header">
          <div>
            <p>Live Session Setup</p>
            <h2 id="create-session-title">Create Live Session</h2>
          </div>
          <button
            aria-label="Close create session modal"
            className="session-modal__close"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <form className="session-modal__form" onSubmit={handleSubmit} noValidate>
          <label className="session-field" htmlFor="batchName">
            <span>Select Batch</span>
            <select
              aria-describedby={errors.batchName ? "batchName-error" : undefined}
              aria-invalid={Boolean(errors.batchName)}
              id="batchName"
              name="batchName"
              onChange={handleChange}
              value={formValues.batchName}
            >
              <option value="">Choose target class</option>
              {batchOptions.map((batchName) => (
                <option key={batchName} value={batchName}>
                  {batchName}
                </option>
              ))}
            </select>
            <small id="batchName-error">{errors.batchName}</small>
          </label>

          <div className="session-modal__grid">
            <label className="session-field" htmlFor="sessionDate">
              <span>Date</span>
              <input
                aria-describedby={errors.sessionDate ? "sessionDate-error" : undefined}
                aria-invalid={Boolean(errors.sessionDate)}
                id="sessionDate"
                name="sessionDate"
                onChange={handleChange}
                type="date"
                value={formValues.sessionDate}
              />
              <small id="sessionDate-error">{errors.sessionDate}</small>
            </label>

            <label className="session-field" htmlFor="sessionTime">
              <span>Time</span>
              <input
                aria-describedby={errors.sessionTime ? "sessionTime-error" : undefined}
                aria-invalid={Boolean(errors.sessionTime)}
                id="sessionTime"
                name="sessionTime"
                onChange={handleChange}
                type="time"
                value={formValues.sessionTime}
              />
              <small id="sessionTime-error">{errors.sessionTime}</small>
            </label>
          </div>

          <div className="session-modal__actions">
            <button className="session-modal__secondary" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="session-modal__primary" type="submit">
              Generate Meeting
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function generateSessionId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ROOM-${randomPart}`;
}

export default CreateSessionModal;
