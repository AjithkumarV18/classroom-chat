import React from "react";
import { Link } from "react-router-dom";
import "./AdminDashboard.css";

const menuItems = [
  {
    label: "Trainer",
    description: "Manage live sessions and launch classrooms.",
    path: "/trainer-dashboard",
  },
  {
    label: "Recordings",
    description: "Upload and manage recorded class sessions.",
    path: "/recordings",
  },
];

function AdminDashboard() {
  return (
    <main className="admin-dashboard-page">
      <aside className="admin-sidebar" aria-label="Dashboard menu tree">
        <div className="admin-sidebar__brand">
          <span>AI Education</span>
          <strong>Admin Console</strong>
        </div>

        <nav className="admin-menu-tree">
          <p>Menu Tree</p>
          <ul>
            <li>
              <details open>
                <summary>Administration</summary>
                <ul>
                  {menuItems.map((item) => (
                    <li key={item.path}>
                      <Link to={item.path}>{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          </ul>
        </nav>
      </aside>

      <section className="admin-main" aria-label="Dashboard overview">
        <header className="admin-main__header">
          <div>
            <p>Dashboard</p>
            <h1>Administration Dashboard</h1>
            <span>Select a module from the left menu tree to continue.</span>
          </div>
        </header>

        <section className="admin-module-grid" aria-label="Available modules">
          {menuItems.map((item) => (
            <article className="admin-module-card" key={item.path}>
              <div>
                <span>{item.label}</span>
                <h2>{item.label} Dashboard</h2>
                <p>{item.description}</p>
              </div>
              <Link to={item.path}>Open {item.label}</Link>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

export default AdminDashboard;
