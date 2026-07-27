# Session Feedback & Rating API

Base URL: `http://localhost:8000`

All APIs require JWT bearer authentication.

## Collection

MongoDB collection: `feedback`

Fields:

- `feedback_id`
- `session_id`
- `student_id`
- `trainer_id`
- `rating` from 1 to 5
- `review`
- `tags`: `Excellent`, `Good`, `Average`, `Poor`
- `created_at`

Duplicate feedback is prevented with a unique index on `session_id + student_id`.

## POST `/api/feedback`

Students submit feedback after a live class.

```json
{
  "session_id": "SES-260713-ABC123",
  "student_id": "demo-student",
  "trainer_id": "demo-teacher",
  "rating": 5,
  "review": "Great session with clear examples.",
  "tags": ["Excellent"]
}
```

## GET `/api/feedback/session/{sessionId}`

Teacher/Admin endpoint. Returns paginated session feedback plus analytics.

Query params:

- `search`
- `page`
- `page_size`

## GET `/api/feedback/trainer/{trainerId}`

Teacher/Admin endpoint. Teachers can view only their own trainer ID. Admins can view any trainer.

Query params:

- `search`
- `page`
- `page_size`

## Analytics Response

Each list response includes:

```json
{
  "average_rating": 4.5,
  "rating_distribution": {
    "1": 0,
    "2": 0,
    "3": 1,
    "4": 2,
    "5": 5
  },
  "total_feedback": 8
}
```