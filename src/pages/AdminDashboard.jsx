import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { notificationsApi } from "../services/api";
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
  {
    label: "Session Recordings",
    description: "Play, download, and delete recorded sessions.",
    path: "/session-recordings",
  },
  {
    label: "Session Management",
    description: "Create, edit, filter, and join virtual classroom sessions.",
    path: "/session-management",
  },
  {
    label: "Attendance",
    description: "Monitor attendance and review student participation records.",
    path: "/attendance",
  },
  {
    label: "Attendance Reports",
    description: "View attendance summaries and export report data.",
    path: "/attendance-reports",
  },
  {
    label: "Notifications",
    description: "Create, send, and manage platform notifications.",
    path: "/notifications",
  },
];

function AdminDashboard() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  useEffect(() => {
    loadNotificationPreview();
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read_status).length,
    [notifications]
  );

  const loadNotificationPreview = async () => {
    try {
      const response = await notificationsApi.my({ page: 1, page_size: 5 });
      setNotifications(response.items || []);
    } catch {
      setNotifications([]);
    }
  };

  const openNotifications = () => {
    setIsNotificationOpen(false);
    navigate("/notifications");
  };

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

          <div className="admin-notification-widget">
            <button
              aria-label="Open notification popup"
              className="admin-notification-button"
              onClick={() => setIsNotificationOpen((isOpen) => !isOpen)}
              type="button"
            >
              <span aria-hidden="true">!</span>
              {unreadCount > 0 ? <strong>{unreadCount}</strong> : null}
            </button>

            {isNotificationOpen ? (
              <section className="admin-notification-popup" aria-label="Recent notifications">
                <div className="admin-notification-popup__header">
                  <h2>Notifications</h2>
                  <button onClick={openNotifications} type="button">Open</button>
                </div>

                {notifications.length > 0 ? (
                  <div className="admin-notification-list">
                    {notifications.slice(0, 3).map((notification) => (
                      <article key={notification.id}>
                        <span className={`admin-notification-priority admin-notification-priority--${notification.priority.toLowerCase()}`}>
                          {notification.priority}
                        </span>
                        <h3>{notification.title}</h3>
                        <p>{notification.message}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="admin-notification-empty">No notifications available.</p>
                )}
              </section>
            ) : null}
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