import React, { useMemo, useState } from "react";
import "./Register.css";
import { Link } from "react-router-dom";

const initialValues = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

  if (name === "email" && !emailPattern.test(trimmedValue)) {
    return "Enter a valid email address.";
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

function Register() {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordStrength = useMemo(
    () => getPasswordStrength(values.password),
    [values.password]
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValues = { ...values, [name]: value };

    setValues(nextValues);

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
      return;
    }

    console.log("Registration form submitted", values);
  };

  return (
    <main className="register-page">
      <section className="register-shell" aria-label="Registration form">
        <div className="register-intro">
          <p className="register-intro__eyebrow">AI Education</p>
          <h1>Create your account</h1>
          <p>
            Join a smarter learning space with guided progress, personalized
            support, and AI-powered study tools.
          </p>
        </div>

        <form className="register-card" onSubmit={handleSubmit} noValidate>
          <div className="register-card__header">
            <h2>Register</h2>
            <p>Enter your details to start learning.</p>
          </div>

          <div className="register-grid">
            <Field
              error={touched.firstName ? errors.firstName : ""}
              label="First Name"
              name="firstName"
              onBlur={handleBlur}
              onChange={handleChange}
              placeholder="Enter first name"
              value={values.firstName}
            />

            <Field
              error={touched.lastName ? errors.lastName : ""}
              label="Last Name"
              name="lastName"
              onBlur={handleBlur}
              onChange={handleChange}
              placeholder="Enter last name"
              value={values.lastName}
            />
          </div>

          <Field
            error={touched.email ? errors.email : ""}
            label="Email Address"
            name="email"
            onBlur={handleBlur}
            onChange={handleChange}
            placeholder="Enter email address"
            type="email"
            value={values.email}
          />

          <PasswordField
            error={touched.password ? errors.password : ""}
            label="Password"
            name="password"
            onBlur={handleBlur}
            onChange={handleChange}
            onToggle={() => setShowPassword((isVisible) => !isVisible)}
            placeholder="Create password"
            showPassword={showPassword}
            value={values.password}
          />

          <div
            className={`password-strength password-strength--${passwordStrength.level}`}
            aria-live="polite"
          >
            <div className="password-strength__track" aria-hidden="true">
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
            placeholder="Confirm password"
            showPassword={showConfirmPassword}
            value={values.confirmPassword}
          />

          <button className="register-button" type="submit">
            Register
          </button>

          <p className="register-login">
            Already have an account? <Link to="/">Login</Link>
          </p>
        </form>
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
  type = "text",
  value,
}) {
  const errorId = `${name}-error`;

  return (
    <label className="register-field" htmlFor={name}>
      <span>{label}</span>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        id={name}
        name={name}
        onBlur={onBlur}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      <small className="register-error" id={errorId}>
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
    <label className="register-field" htmlFor={name}>
      <span>{label}</span>
      <div className="register-password">
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
      <small className="register-error" id={errorId}>
        {error}
      </small>
    </label>
  );
}

export default Register;
