import React, { useMemo, useState } from "react";
import "./ResetPassword.css";
import { Link } from "react-router-dom";

const initialValues = {
  resetCode: "",
  password: "",
  confirmPassword: "",
};

const passwordRules = {
  minLength: /.{8,}/,
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /\d/,
  special: /[^A-Za-z0-9]/,
};

function getPasswordStrength(password) {
  const passedRules = Object.values(passwordRules).filter((rule) =>
    rule.test(password)
  ).length;

  if (!password) {
    return { label: "", level: 0 };
  }

  if (passedRules <= 2) {
    return { label: "Weak", level: 1 };
  }

  if (passedRules <= 4) {
    return { label: "Medium", level: 2 };
  }

  return { label: "Strong", level: 3 };
}

function validateField(name, value, values) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "This field is required.";
  }

  if (name === "resetCode" && trimmedValue.length < 4) {
    return "Enter the reset code sent to your email.";
  }

  if (name === "password") {
    if (!passwordRules.minLength.test(value)) {
      return "Password must be at least 8 characters.";
    }

    if (!passwordRules.uppercase.test(value)) {
      return "Password must include at least one uppercase letter.";
    }

    if (!passwordRules.lowercase.test(value)) {
      return "Password must include at least one lowercase letter.";
    }

    if (!passwordRules.number.test(value)) {
      return "Password must include at least one number.";
    }

    if (!passwordRules.special.test(value)) {
      return "Password must include at least one special character.";
    }
  }

  if (name === "confirmPassword" && value !== values.password) {
    return "Confirm Password must match Password.";
  }

  return "";
}

function validateForm(values) {
  return Object.keys(values).reduce((errors, fieldName) => {
    return {
      ...errors,
      [fieldName]: validateField(fieldName, values[fieldName], values),
    };
  }, {});
}

function ResetPassword() {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const passwordStrength = useMemo(
    () => getPasswordStrength(values.password),
    [values.password]
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValues = { ...values, [name]: value };

    setValues(nextValues);
    setSuccessMessage("");

    if (touched[name]) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        [name]: validateField(name, value, nextValues),
        ...(name === "password" && touched.confirmPassword
          ? {
              confirmPassword: validateField(
                "confirmPassword",
                nextValues.confirmPassword,
                nextValues
              ),
            }
          : {}),
      }));
    }
  };

  const handleBlur = (event) => {
    const { name, value } = event.target;

    setTouched((currentTouched) => ({
      ...currentTouched,
      [name]: true,
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: validateField(name, value, values),
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const nextErrors = validateForm(values);
    const nextTouched = Object.keys(values).reduce(
      (fields, fieldName) => ({ ...fields, [fieldName]: true }),
      {}
    );

    setTouched(nextTouched);
    setErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      setSuccessMessage("");
      return;
    }

    setSuccessMessage("Your password has been reset successfully.");
  };

  return (
    <main className="reset-page">
      <section className="reset-card" aria-label="Reset password form">
        <a className="reset-card__back" href="/forgot-password">
          Back to Forgot Password
        </a>

        <div className="reset-card__header">
          <p>AI Education</p>
          <h1>Reset Password</h1>
          <span>Enter your reset code and create a new password.</span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <Field
            error={touched.resetCode ? errors.resetCode : ""}
            label="Reset Code"
            name="resetCode"
            onBlur={handleBlur}
            onChange={handleChange}
            placeholder="Enter reset code"
            value={values.resetCode}
          />

          <PasswordField
            error={touched.password ? errors.password : ""}
            label="New Password"
            name="password"
            onBlur={handleBlur}
            onChange={handleChange}
            onToggle={() => setShowPassword((isVisible) => !isVisible)}
            placeholder="Create new password"
            showPassword={showPassword}
            value={values.password}
          />

          <div
            className={`reset-strength reset-strength--${passwordStrength.level}`}
            aria-live="polite"
          >
            <div className="reset-strength__track" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>
              Password Strength
              {passwordStrength.label ? `: ${passwordStrength.label}` : ""}
            </p>
          </div>

          <PasswordField
            error={touched.confirmPassword ? errors.confirmPassword : ""}
            label="Confirm Password"
            name="confirmPassword"
            onBlur={handleBlur}
            onChange={handleChange}
            onToggle={() =>
              setShowConfirmPassword((isVisible) => !isVisible)
            }
            placeholder="Confirm new password"
            showPassword={showConfirmPassword}
            value={values.confirmPassword}
          />

          {successMessage ? (
            <p className="reset-success" role="status">
              {successMessage}
            </p>
          ) : null}

          <button className="reset-button" type="submit">
            Reset Password
          </button>
        </form>

        <p className="reset-card__footer">
          Remembered your password? <Link to="/">Login</Link>
        </p>
      </section>
    </main>
  );
}

function Field({
  error,
  label,
  name,
  onBlur,
  onChange,
  placeholder,
  value,
}) {
  const errorId = `${name}-error`;

  return (
    <label className="reset-field" htmlFor={name}>
      <span>{label}</span>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        id={name}
        name={name}
        onBlur={onBlur}
        onChange={onChange}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      <small className="reset-error" id={errorId}>
        {error}
      </small>
    </label>
  );
}

function PasswordField({
  error,
  label,
  name,
  onBlur,
  onChange,
  onToggle,
  placeholder,
  showPassword,
  value,
}) {
  const errorId = `${name}-error`;

  return (
    <label className="reset-field" htmlFor={name}>
      <span>{label}</span>
      <div className="reset-password">
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          id={name}
          name={name}
          onBlur={onBlur}
          onChange={onChange}
          placeholder={placeholder}
          type={showPassword ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={showPassword ? `Hide ${label}` : `Show ${label}`}
          onClick={onToggle}
          type="button"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      <small className="reset-error" id={errorId}>
        {error}
      </small>
    </label>
  );
}

export default ResetPassword;
