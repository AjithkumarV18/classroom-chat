# Virtual Classroom Chat API

Base URL: `http://localhost:8000`

All chat APIs require JWT authentication with:

```http
Authorization: Bearer <access_token>
```

## Collection

MongoDB collection: `chat_messages`

Stored fields:

- `message_id`
- `session_id`
- `sender_id`
- `sender_name`
- `message`
- `message_type` (`Text` or `File`)
- `timestamp`
- `date_created`

## Permissions

| API | Student | Teacher | Admin | Employer | Employee |
| --- | --- | --- | --- | --- | --- |
| `POST /api/chat/send` | Session participant only | Yes | Yes | No | No |
| `GET /api/chat/session/{sessionId}` | Session participant only | Yes | Yes | No | No |
| `DELETE /api/chat/{messageId}` | No | Yes | Yes | No | No |

Students are treated as session participants when an attendance record exists for the same `user_id` and `session_id`.

## Send Message

`POST /api/chat/send`

```json
{
  "session_id": "SES-260713-ABC123",
  "sender_id": "demo-teacher",
  "sender_name": "Teacher Demo",
  "message": "Welcome to the live class.",
  "message_type": "Text"
}
```

Validation:

- Message is required.
- Message max length is 1000 characters.
- Session must exist.
- Sender ID must match the authenticated JWT user.
- Sender must be allowed in the session.

## Get Session Messages

`GET /api/chat/session/{sessionId}`

Returns messages in chronological order.

## Delete Message

`DELETE /api/chat/{messageId}`

Only `Teacher` and `Admin` roles can delete messages.

## Common Errors

- `401`: Authentication required or token invalid.
- `403`: Unauthorized role or user is not a session participant.
- `404`: Invalid session or message not found.
- `422`: Empty/invalid request data.
- `500`: Database operation failed.
