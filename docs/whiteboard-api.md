# Whiteboard Collaboration API

Base URL: `http://localhost:8000`

All APIs require JWT bearer auth.

## Collection

MongoDB collection: `whiteboard_entries`

Fields:

- `whiteboard_id`
- `session_id`
- `user_id`
- `drawing_data`
- `tool_type`: `Pen`, `Eraser`, `Shape`, `Text`, `Sticky`
- `color`
- `stroke_width`
- `timestamp`

## APIs

### POST `/api/whiteboard/save`

Saves a single drawing item.

```json
{
  "session_id": "SES-260713-ABC123",
  "user_id": "demo-teacher",
  "drawing_data": { "id": "shape-1", "type": "rectangle" },
  "tool_type": "Shape",
  "color": "#2364d2",
  "stroke_width": 4
}
```

### GET `/api/whiteboard/{sessionId}`

Returns all drawing data for a session in timestamp order.

### PUT `/api/whiteboard/{sessionId}`

Replaces all whiteboard content for a session.

```json
{
  "user_id": "demo-teacher",
  "drawings": [
    {
      "session_id": "SES-260713-ABC123",
      "user_id": "demo-teacher",
      "drawing_data": { "id": "shape-1", "type": "rectangle" },
      "tool_type": "Shape",
      "color": "#2364d2",
      "stroke_width": 4
    }
  ]
}
```

### DELETE `/api/whiteboard/{sessionId}`

Clears the whiteboard. Teacher/Admin only.

## Authorization

- Teacher/Admin can save, read, update, and clear.
- Student can save/read/update only when they have an attendance record for the session.
- Clear is restricted to Teacher/Admin.