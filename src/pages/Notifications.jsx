import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAuthUser } from "../auth/auth";
import { notificationsApi } from "../services/api";
import "./Notifications.css";

const initialFilters = {
  search: "",
  priority: "All",
  recipientType: "All",
  readStatus: "All",
  startDate: "",
  endDate: "",
};

const emptyForm = {
  title: "",
  message: "",
  recipientType: "All",
  recipientId: "",
  batchId: "",
  priority: "Medium",
  notificationStatus: "Sent",
};

const priorities = ["Low", "Medium", "High"];
const recipientTypes = ["All", "Batch", "User"];
const statuses = ["Active", "Draft", "Sent"];

function Notifications() {
  const authUser = getAuthUser();
  const userRole = authUser?.role || "";
  const canCreate = ["Teacher", "Admin"].includes(userRole);
  const canDelete = userRole === "Admin";
  const [notifications, setNotifications] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [formValues, setFormValues] = useState(emptyForm);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [editingNotification, setEditingNotification] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadNotifications();
  }, [page]);

  const stats = useMemo(() => {
    const unread = notifications.filter((item) => !item.readStatus).length;
    const highPriority = notifications.filter((item) => item.priority === "High").length;
    return {
      total: total || notifications.length,
      unread,
      highPriority,
      recent: notifications.slice(0, 5).length,
    };
  }, [notifications, total]);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const params = buildQueryParams(filters, page);
      const response = canCreate
        ? await notificationsApi.list(params)
        : await notificationsApi.my(params);
      setNotifications(response.items.map(mapNotificationFromApi));
      setTotal(response.total);
    } catch (error) {
      showToast(error.message || "Unable to load notifications.", "error");
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const applyFilters = () => {
    setPage(1);
    loadNotifications();
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
    window.setTimeout(loadNotifications, 0);
  };

  const openCreateModal = () => {
    setEditingNotification(null);
    setFormValues(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (notification) => {
    setEditingNotification(notification);
    setFormValues({
      title: notification.title,
      message: notification.message,
      recipientType: notification.recipientType,
      recipientId: notification.recipientId || "",
      batchId: notification.batchId || "",
      priority: notification.priority,
      notificationStatus: notification.notificationStatus,
    });
    setIsModalOpen(true);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormValues((current) => ({ ...current, [name]: value }));
  };

  const saveNotification = async (event) => {
    event.preventDefault();
    if (!formValues.title.trim() || !formValues.message.trim()) {
      showToast("Title and message are required.", "error");
      return;
    }

    const payload = {
      title: formValues.title.trim(),
      message: formValues.message.trim(),
      recipient_type: formValues.recipientType,
      recipient_id: formValues.recipientType === "User" ? formValues.recipientId.trim() : null,
      batch_id: formValues.recipientType === "Batch" ? formValues.batchId.trim() : null,
      priority: formValues.priority,
      notification_status: formValues.notificationStatus,
    };

    try {
      if (editingNotification) {
        await notificationsApi.update(editingNotification.id, payload);
        showToast("Notification updated successfully.");
      } else {
        await notificationsApi.create(payload);
        showToast("Notification sent successfully.");
      }
      setIsModalOpen(false);
      await loadNotifications();
    } catch (error) {
      showToast(error.message || "Unable to save notification.", "error");
    }
  };

  const markAsRead = async (notification) => {
    try {
      await notificationsApi.markRead(notification.id);
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, readStatus: true } : item)
      );
      showToast("Notification marked as read.");
    } catch (error) {
      showToast(error.message || "Unable to mark notification as read.", "error");
    }
  };

  const deleteNotification = async (notification) => {
    const confirmed = window.confirm(`Delete notification: ${notification.title}?`);
    if (!confirmed) return;

    try {
      await notificationsApi.delete(notification.id);
      showToast("Notification deleted successfully.");
      await loadNotifications();
    } catch (error) {
      showToast(error.message || "Unable to delete notification.", "error");
    }
  };

  return (
    <main className="notifications-page">
      <section className="notifications-shell" aria-label="Notification management">
        <header className="notifications-header">
          <div>
            <p>Notification Management</p>
            <h1>{canCreate ? "Manage Notifications" : "My Notifications"}</h1>
            <span>
              {canCreate
                ? "Create, filter, edit, and send platform notifications."
                : "View platform updates and mark notifications as read."}
            </span>
          </div>
          <div className="notifications-header__actions">
            <Link to="/dashboard">Dashboard</Link>
            <button onClick={loadNotifications} type="button">Refresh</button>
            {canCreate ? <button onClick={openCreateModal} type="button">+ Create Notification</button> : null}
          </div>
        </header>

        {toast ? <p className={`notifications-toast notifications-toast--${toast.type}`}>{toast.message}</p> : null}

        <section className="notifications-stats" aria-label="Notification statistics">
          <StatsCard label="Total Notifications" value={stats.total} />
          <StatsCard label="Unread Notifications" value={stats.unread} tone="unread" />
          <StatsCard label="High Priority" value={stats.highPriority} tone="high" />
          <StatsCard label="Recent Notifications" value={stats.recent} />
        </section>

        <section className="notifications-card">
          <div className="notifications-card__header">
            <h2>Filters</h2>
            <span>{total} records</span>
          </div>
          <form className="notifications-filters" onSubmit={(event) => event.preventDefault()}>
            <label>
              <span>Search Title</span>
              <input name="search" onChange={handleFilterChange} placeholder="Search by title" type="search" value={filters.search} />
            </label>
            <label>
              <span>Priority</span>
              <select name="priority" onChange={handleFilterChange} value={filters.priority}>
                <option value="All">All</option>
                {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
            </label>
            {canCreate ? (
              <label>
                <span>Recipient Type</span>
                <select name="recipientType" onChange={handleFilterChange} value={filters.recipientType}>
                  <option value="All">All</option>
                  {recipientTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
            ) : null}
            <label>
              <span>Read Status</span>
              <select name="readStatus" onChange={handleFilterChange} value={filters.readStatus}>
                <option value="All">All</option>
                <option value="false">Unread</option>
                <option value="true">Read</option>
              </select>
            </label>
            <label>
              <span>Start Date</span>
              <input name="startDate" onChange={handleFilterChange} type="date" value={filters.startDate} />
            </label>
            <label>
              <span>End Date</span>
              <input name="endDate" onChange={handleFilterChange} type="date" value={filters.endDate} />
            </label>
            <button onClick={applyFilters} type="button">Apply</button>
            <button className="notifications-secondary" onClick={resetFilters} type="button">Clear</button>
          </form>
        </section>

        <section className="notifications-card">
          <div className="notifications-card__header">
            <h2>{canCreate ? "Notification List" : "Student Notification Panel"}</h2>
            <span>Page {page}</span>
          </div>

          {isLoading ? (
            <div className="notifications-empty"><span className="notifications-spinner" /> <p>Loading notifications...</p></div>
          ) : notifications.length === 0 ? (
            <div className="notifications-empty"><h3>No notifications available</h3><p>Create a notification or adjust your filters.</p></div>
          ) : (
            <div className="notifications-table-wrap">
              <table className="notifications-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Message</th>
                    <th>Sender</th>
                    <th>Priority</th>
                    <th>Recipient</th>
                    <th>Created Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((notification) => (
                    <tr key={notification.id}>
                      <td>{notification.title}</td>
                      <td>{notification.message}</td>
                      <td>{notification.senderRole}</td>
                      <td><span className={`notification-priority notification-priority--${notification.priority.toLowerCase()}`}>{notification.priority}</span></td>
                      <td>{formatRecipient(notification)}</td>
                      <td>{notification.createdAtLabel}</td>
                      <td><span className={`notification-read notification-read--${notification.readStatus ? "read" : "unread"}`}>{notification.readStatus ? "Read" : "Unread"}</span></td>
                      <td>
                        <div className="notifications-actions">
                          <button onClick={() => setSelectedNotification(notification)} type="button">View</button>
                          {!notification.readStatus ? <button onClick={() => markAsRead(notification)} type="button">Mark Read</button> : null}
                          {canCreate ? <button onClick={() => openEditModal(notification)} type="button">Edit</button> : null}
                          {canDelete ? <button className="danger" onClick={() => deleteNotification(notification)} type="button">Delete</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="notifications-pagination">
            <button disabled={page === 1} onClick={() => setPage((current) => Math.max(current - 1, 1))} type="button">Previous</button>
            <span>{notifications.length} shown of {total}</span>
            <button disabled={page * 20 >= total} onClick={() => setPage((current) => current + 1)} type="button">Next</button>
          </div>
        </section>
      </section>

      {isModalOpen ? (
        <NotificationModal
          editingNotification={editingNotification}
          formValues={formValues}
          onChange={handleFormChange}
          onClose={() => setIsModalOpen(false)}
          onSubmit={saveNotification}
        />
      ) : null}

      {selectedNotification ? (
        <NotificationDetails notification={selectedNotification} onClose={() => setSelectedNotification(null)} />
      ) : null}
    </main>
  );
}

function StatsCard({ label, value, tone = "default" }) {
  return <article className={`notifications-stat notifications-stat--${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function NotificationModal({ editingNotification, formValues, onChange, onClose, onSubmit }) {
  return (
    <div className="notifications-modal-backdrop">
      <section className="notifications-modal" role="dialog" aria-modal="true">
        <header>
          <h2>{editingNotification ? "Edit Notification" : "Create Notification"}</h2>
          <button onClick={onClose} type="button">x</button>
        </header>
        <form className="notifications-modal-form" onSubmit={onSubmit}>
          <label><span>Notification Title</span><input name="title" onChange={onChange} value={formValues.title} /></label>
          <label className="wide"><span>Message</span><textarea name="message" onChange={onChange} rows="4" value={formValues.message} /></label>
          <label><span>Recipient Type</span><select name="recipientType" onChange={onChange} value={formValues.recipientType}>{recipientTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          {formValues.recipientType === "User" ? <label><span>Select User / User ID</span><input name="recipientId" onChange={onChange} placeholder="Example: user object id or demo-student" value={formValues.recipientId} /></label> : null}
          {formValues.recipientType === "Batch" ? <label><span>Select Batch / Batch ID</span><input name="batchId" onChange={onChange} placeholder="Example: Batch A" value={formValues.batchId} /></label> : null}
          <label><span>Priority</span><select name="priority" onChange={onChange} value={formValues.priority}>{priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
          <label><span>Status</span><select name="notificationStatus" onChange={onChange} value={formValues.notificationStatus}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <div className="notifications-modal-actions"><button className="notifications-secondary" onClick={onClose} type="button">Cancel</button><button type="submit">Send Button</button></div>
        </form>
      </section>
    </div>
  );
}

function NotificationDetails({ notification, onClose }) {
  return (
    <div className="notifications-modal-backdrop">
      <section className="notifications-modal" role="dialog" aria-modal="true">
        <header><h2>{notification.title}</h2><button onClick={onClose} type="button">x</button></header>
        <div className="notifications-details-grid">
          <div><span>Message</span><p>{notification.message}</p></div>
          <div><span>Sender Details</span><strong>{notification.senderRole}</strong><p>{notification.senderId}</p></div>
          <div><span>Date & Time</span><strong>{notification.createdAtLabel}</strong></div>
          <div><span>Priority</span><strong>{notification.priority}</strong></div>
          <div><span>Recipient Information</span><strong>{formatRecipient(notification)}</strong></div>
          <div><span>Read Status</span><strong>{notification.readStatus ? "Read" : "Unread"}</strong></div>
        </div>
      </section>
    </div>
  );
}

function buildQueryParams(filters, page) {
  const params = { page, page_size: 20 };
  if (filters.search) params.search = filters.search;
  if (filters.priority !== "All") params.priority = filters.priority;
  if (filters.recipientType !== "All") params.recipient_type = filters.recipientType;
  if (filters.readStatus !== "All") params.read_status = filters.readStatus;
  if (filters.startDate) params.start_date = new Date(filters.startDate).toISOString();
  if (filters.endDate) params.end_date = new Date(`${filters.endDate}T23:59:59`).toISOString();
  return params;
}

function mapNotificationFromApi(item) {
  return {
    id: item.id,
    notificationId: item.notification_id,
    title: item.title,
    message: item.message,
    senderId: item.sender_id,
    senderRole: item.sender_role,
    recipientType: item.recipient_type,
    recipientId: item.recipient_id,
    batchId: item.batch_id,
    priority: item.priority,
    readStatus: item.read_status,
    notificationStatus: item.notification_status,
    createdAtLabel: formatDateTime(item.created_at),
  };
}

function formatRecipient(notification) {
  if (notification.recipientType === "All") return "All platform users";
  if (notification.recipientType === "Batch") return notification.batchId || notification.recipientId || "Batch";
  return notification.recipientId || "User";
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default Notifications;