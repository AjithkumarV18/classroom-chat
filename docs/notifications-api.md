# Notification Management API

Base URL: `http://localhost:8000`

FastAPI exposes interactive OpenAPI documentation at `/docs`. All notification
HTTP endpoints require JWT bearer authentication.

## Roles

- Admin: create platform, batch, and classroom notifications; list all; update;
  mark read; and soft delete.
- Teacher: create notifications only for owned sessions/batches; list, update,
  and delete only notifications they created.
- Student: list assigned notifications and update only their own recipient read
  state.

## Fields

- Priorities: `Low`, `Medium`, `High`, `Emergency`
- Target audiences: `All`, `Batch`, `LiveClassroom`
- A `Batch` target requires `batch_id` and may include its matching `session_id`.
- A `LiveClassroom` target requires `session_id`.
- Recipient read and delivery state is stored in `notification_receipts`, not
  as one shared notification flag.

## Endpoints

### POST `/api/notifications`

Teacher/Admin. Returns `201 Created`.

```json
{
  "session_id": "ROOM-AI2048",
  "batch_id": "AI Foundations - Batch A",
  "title": "Live Class Started",
  "message": "Your live class has started. Please join the session.",
  "priority": "High",
  "target_audience": "Batch"
}
```

### GET `/api/notifications`

Authenticated. Admin sees all, Teacher sees their own, and Student sees only
assigned recipient records.

Query parameters: `search`, `priority`, `recipient_type`, `read_status`,
`unread_only`, `session_id`, `batch_id`, `start_date`, `end_date`, `sort`
(`newest` or `oldest`), `page`, and `page_size`.

### GET `/api/notifications/my`

Alias of the role-scoped list endpoint.

### GET `/api/notifications/unread-count`

Returns `{ "unread_count": number }`.

### PATCH `/api/notifications/read-all`

Marks all recipient records assigned to the authenticated user as read.

### GET `/api/notifications/{id}`

Returns one authorized, non-deleted notification.

### PATCH or PUT `/api/notifications/{id}/read`

Marks only the authenticated user's recipient record as read.

### PUT `/api/notifications/{id}`

Teacher/Admin. Updates `title`, `message`, and/or `priority`.

### DELETE `/api/notifications/{id}`

Teacher may soft-delete their own notification; Admin may soft-delete any.

### WebSocket `/api/notifications/ws`

Query parameters: `token` and `channel`. Supported channels are `all`,
`batch_<batchId>`, `classroom_<sessionId>`, and the authenticated user's
`user_<userId>`. The event name is `NEW_NOTIFICATION`.
