# Notification Management API

Base URL: `http://localhost:8000`

All endpoints require JWT authentication.

## Roles

- Admin: create, list all, view details, edit, mark read, soft delete.
- Teacher: create, list all, view details, edit own notifications, mark read.
- Student: view own notifications, mark read, filter read/unread.

## Fields

- `notification_id`
- `title`
- `message`
- `sender_id`
- `sender_role`
- `recipient_type`: `All`, `Batch`, `User`
- `recipient_id`
- `batch_id`
- `priority`: `Low`, `Medium`, `High`
- `read_status`
- `notification_status`: `Active`, `Draft`, `Sent`, `Deleted`
- `created_at`
- `updated_at`

## Endpoints

### POST `/api/notifications`

Create notification. Teacher/Admin only.

```json
{
  "title": "Live class reminder",
  "message": "Your AI class starts at 10 AM.",
  "recipient_type": "All",
  "priority": "High",
  "notification_status": "Sent"
}
```

### GET `/api/notifications`

List all notifications. Teacher/Admin only.

Query params:

- `search`
- `priority`
- `recipient_type`
- `status`
- `start_date`
- `end_date`
- `page`
- `page_size`

### GET `/api/notifications/my`

List notifications for the logged-in user.

Query params:

- `search`
- `priority`
- `read_status`
- `start_date`
- `end_date`
- `page`
- `page_size`

### GET `/api/notifications/{id}`

Get notification details.

### PUT `/api/notifications/{id}/read`

Mark notification as read for the logged-in user.

### PUT `/api/notifications/{id}`

Update notification. Teacher/Admin only.

### DELETE `/api/notifications/{id}`

Soft delete notification. Admin only.