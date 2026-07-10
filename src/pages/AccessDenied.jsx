import React from "react";
import { Link } from "react-router-dom";
import { getAuthUser } from "../auth/auth";
import "./AccessDenied.css";

function AccessDenied() {
  const user = getAuthUser();

  return (
    <main className="access-denied-page">
      <section className="access-denied-card">
        <p>Access Denied</p>
        <h1>You do not have permission to view this page.</h1>
        <span>
          Current role: <strong>{user?.role || "Not logged in"}</strong>
        </span>
        <div className="access-denied-actions">
          <Link to="/dashboard">Go to Dashboard</Link>
          <Link to="/">Switch Login</Link>
        </div>
      </section>
    </main>
  );
}

export default AccessDenied;
