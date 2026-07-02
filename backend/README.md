# Classroom Chat Backend

Python FastAPI backend for the React auth pages with MongoDB storage.

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

## Endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

## Request examples

Register:

```json
{
  "first_name": "Ajith",
  "last_name": "Kumar",
  "email": "ajith@example.com",
  "password": "Password@123"
}
```

Login:

```json
{
  "email": "ajith@example.com",
  "password": "Password@123"
}
```

Forgot password:

```json
{
  "email": "ajith@example.com"
}
```

Reset password:

```json
{
  "email": "ajith@example.com",
  "reset_code": "123456",
  "password": "NewPassword@123"
}
```

The forgot-password endpoint returns the reset code in the response for local development. Replace that with email delivery before production.
