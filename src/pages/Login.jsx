import React from "react";
import "./Login.css";
import { Link, useNavigate } from "react-router-dom";

const features = [
  {
    title: "Smart Learning",
    description: "Adaptive lessons that support each learner's pace.",
  },
  {
    title: "Track Progress",
    description: "Clear milestones and insights for every learning goal.",
  },
  {
    title: "AI Assistance",
    description: "Guided help whenever students need an extra nudge.",
  },
];

function Login() {
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();
    navigate("/trainer-dashboard");
  };

  return (
    <main className="login-page">
      <section className="login-hero" aria-label="AI Education overview">
        <div className="login-hero__content">
          <p className="login-hero__app">AI Education</p>
          <h1>Empowering Minds with AI Education</h1>
          <p className="login-hero__description">
            Build confident learning habits with intelligent support,
            measurable progress, and personalized guidance.
          </p>

          <div className="login-features" aria-label="Platform highlights">
            {features.map((feature) => (
              <article className="login-feature" key={feature.title}>
                <span className="login-feature__icon" aria-hidden="true">
                  {feature.title.charAt(0)}
                </span>
                <div>
                  <h2>{feature.title}</h2>
                  <p>{feature.description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="login-illustration" aria-hidden="true">
            <div className="login-illustration__panel login-illustration__panel--large">
              <span />
              <strong>AI Tutor</strong>
              <small>Personalized path ready</small>
            </div>
            <div className="login-illustration__panel login-illustration__panel--small">
              <strong>86%</strong>
              <small>Progress</small>
            </div>
            <div className="login-illustration__node login-illustration__node--one" />
            <div className="login-illustration__node login-illustration__node--two" />
            <div className="login-illustration__node login-illustration__node--three" />
          </div>
        </div>
      </section>

      <section className="login-panel" aria-label="Login form">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card__header">
            <h2>Welcome Back</h2>
            <p>Sign in to continue your AI learning journey.</p>
          </div>

          <label className="login-field" htmlFor="email">
            <span>Email Address</span>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Enter your email"
              autoComplete="email"
            />
          </label>

          <label className="login-field" htmlFor="password">
            <span>Password</span>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </label>

          <div className="login-options">
            <label className="login-remember" htmlFor="remember">
              <input id="remember" name="remember" type="checkbox" />
              <span>Remember Me</span>
            </label>
            <Link to="/forgot-password">Forgot Password?</Link>
          </div>

          <button className="login-button" type="submit">
            Login
          </button>

          <p className="login-register">
            Don&apos;t have an account? <Link to="/register">Register</Link>
          </p>
        </form>
      </section>
    </main>
  );
}

export default Login;

