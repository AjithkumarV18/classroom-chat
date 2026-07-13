# Attendance Management API

Base URL: `http://localhost:8000`

All attendance APIs require a bearer token:

```http
Authorization: Bearer <access_token>
```

## RBAC Permissions

| Endpoint | Student | Teacher | Admin | Employer | Employee |
| --- | --- | --- | --- | --- | --- |
| `POST /api/attendance/mark` | Own record only | Yes | Yes | No | No |
| `GET /api/attendance/session/{sessionId}` | No | Yes | Yes | No | No |
| `GET /api/attendance/student/{studentId}` | Own record only | Yes | Yes | No | No |
| `PUT /api/attendance/update` | No | Yes | Yes | No | No |

## Stored Fields

- `user_id`
- `session_id`
- `join_time`
- `leave_time`
- `duration_seconds`
- `duration_minutes`
- `status`
- `created_at`
- `updated_at`

Duplicate attendance is prevented with a unique MongoDB index on `user_id + session_id`.

## POST `/api/attendance/mark`

Marks attendance for a user in a session.

```json
{
  "user_id": "demo-student",
  "session_id": "SESSION-1001",
  "join_time": "2026-07-13T10:00:00Z",
  "status": "Present"
}
```

Successful response: `201 Created`

```json
{
  "id": "mongo_object_id",
  "user_id": "demo-student",
  "session_id": "SESSION-1001",
  "join_time": "2026-07-13T10:00:00Z",
  "leave_time": null,
  "duration_seconds": 0,
  "duration_minutes": 0,
  "status": "Present",
  "created_at": "2026-07-13T10:00:05Z",
  "updated_at": "2026-07-13T10:00:05Z"
}
```

Duplicate response: `409 Conflict`

## GET `/api/attendance/session/{sessionId}`

Returns all attendance records for one session. Allowed for `Teacher` and `Admin`.

Example:

```http
GET /api/attendance/session/SESSION-1001
```

## GET `/api/attendance/student/{studentId}`

Returns all attendance records for one student. Students can only view their own records.

Example:

```http
GET /api/attendance/student/demo-student
```

## PUT `/api/attendance/update`

Updates attendance and recalculates duration.

```json
{
  "user_id": "demo-student",
  "session_id": "SESSION-1001",
  "leave_time": "2026-07-13T11:15:00Z",
  "status": "Left"
}
```

If `leave_time` is provided, the API calculates:

```text
duration_seconds = leave_time - join_time
duration_minutes = duration_seconds / 60
```

## Postman Test Steps

1. Import `attendance-postman-collection.json`.
2. Run `Demo Login - Teacher` or `Demo Login - Admin`.
3. Run `Mark Attendance`.
4. Run `Mark Attendance` again to verify duplicate prevention returns `409`.
5. Run `Update Attendance` with a leave time.
6. Run `Get Attendance By Session`.
7. Run `Get Attendance By Student`.
