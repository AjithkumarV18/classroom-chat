import React, { useState } from "react";
import "./ForgotPassword.css";
import { Link } from "react-router-dom";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return "Email Address is required.";
  }

  if (!emailPattern.test(trimmedEmail)) {
    return "Enter a valid email address.";
  }

  return "";
}

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (event) => {
    const nextEmail = event.target.value;

    setEmail(nextEmail);
    setSuccessMessage("");

    if (error) {
      setError(validateEmail(nextEmail));
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const validationMessage = validateEmail(email);
    setError(validationMessage);

    if (validationMessage) {
      setSuccessMessage("");
      return;
    }

    setSuccessMessage(
      "A password reset code has been sent to your email address."
    );
  };

  return (
    <main className="forgot-page">
      <section className="forgot-card" aria-label="Forgot password form">
        <a className="register-login">
          Back to Login
        </a>

        <div className="forgot-card__header">
          <p>AI Education</p>
          <h1>Forgot Password?</h1>
          <span>
            Enter your email address and we will send you a reset code.
          </span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label className="forgot-field" htmlFor="email">
            <span>Email Address</span>
            <input
              aria-describedby={error ? "email-error" : undefined}
              aria-invalid={Boolean(error)}
              autoComplete="email"
              id="email"
              name="email"
              onBlur={() => setError(validateEmail(email))}
              onChange={handleChange}
              placeholder="Enter your email"
              type="email"
              value={email}
            />
            <small className="forgot-error" id="email-error">
              {error}
            </small>
          </label>

          {successMessage ? (
            <p className="forgot-success" role="status">
              {successMessage}
            </p>
          ) : null}

          <button className="forgot-button" type="submit">
            Send Code
          </button>
        </form>

        <p className="forgot-card__footer">
          Already have a code? <Link to="/reset-password">Reset Password</Link>
        </p>
      </section>
    </main>
  );
}

export default ForgotPassword;
