# Classroom Chat Backend

Python FastAPI backend for the React auth, trainer, recordings, and session recordings pages with MongoDB storage.

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Update `.env` with your MongoDB connection string if you are not using local MongoDB.

## Core Endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

## Trainer Sessions CRUD

- `POST /api/trainer-sessions`
- `GET /api/trainer-sessions`
- `GET /api/trainer-sessions/{session_id}`
- `PUT /api/trainer-sessions/{session_id}`
- `DELETE /api/trainer-sessions/{session_id}`

Example create body:

```json
{
  "room_id": "ROOM-AI2048",
  "batch_name": "AI Foundations - Batch A",
  "scheduled_date": "2026-07-10",
  "scheduled_time": "10:30",
  "students_notified": false
}
```

## Recordings CRUD

- `POST /api/recordings`
- `GET /api/recordings`
- `GET /api/recordings/{recording_object_id}`
- `PUT /api/recordings/{recording_object_id}`
- `DELETE /api/recordings/{recording_object_id}`

Example create body:

```json
{
  "recording_id": "REC-AI1024",
  "session_name": "ROOM-AI2048 - AI Foundations",
  "title": "Introduction to AI Concepts",
  "video_file_name": "ai-foundations-intro.mp4",
  "duration": "42 min"
}
```

## Session Recordings CRUD

- `POST /api/session-recordings`
- `GET /api/session-recordings`
- `GET /api/session-recordings/{session_recording_id}`
- `PUT /api/session-recordings/{session_recording_id}`
- `DELETE /api/session-recordings/{session_recording_id}`

Example create body:

```json
{
  "recording_id": "REC-AI1024",
  "session_name": "ROOM-AI2048 - AI Foundations",
  "duration": "42 min"
}
```

The forgot-password endpoint returns the reset code in the response for local development. Replace that with email delivery before production.
