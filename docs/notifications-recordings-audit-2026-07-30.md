# Notifications and Recordings Backend Audit — 2026-07-30

## 1. Overall Status

| Module | Status | Submission conclusion |
|---|---|---|
| Live Session Announcements & System Alerts | Fully completed and verified | Ready with minor known limitations |
| Session Recording Management & Playback | Completed but partially verified | Ready with minor known limitations |

The conclusions apply to the local, single-process development environment.
They do not certify production deployment, multi-instance real-time fan-out, or
an external encoding/storage pipeline.

## Project Discovery

| Area | Finding |
|---|---|
| Backend | FastAPI 0.116.1, Python |
| Database | MongoDB 8.3 local service, database `classroom_chat` |
| Data access | Motor 3.7.1 (`AsyncIOMotorClient`), schema-on-write documents |
| Authentication | JWT bearer, `python-jose`, HS256, 60-minute access tokens |
| JWT middleware | `backend/app/authz.py`: `HTTPBearer`, `get_current_user`, `require_roles` |
| Roles | `Student`, `Teacher` (trainer), `Employer`, `Employee`, `Admin` |
| Session models | `managed_sessions` and `trainer_sessions` |
| Batch model | No independent batch collection; `trainer_sessions.batch_name` is the batch source |
| Enrollment model | No enrollment collection; user `batch_id`/`batch_name` fields are the effective enrollment |
| Notification models | `notifications`, `notification_receipts` |
| Recording models | `recordings`; legacy `session_recordings` also exists |
| Analytics models | Aggregate fields on `recordings`; no separate view/download history collection |
| Storage | Local `backend/uploads`, random storage keys; access now only through authorized recording APIs |
| Real-time | Native FastAPI WebSockets; in-memory channel managers |
| API documentation | FastAPI OpenAPI/Swagger at `/docs`; Markdown and Postman files under `docs` |
| Automated tests | No runnable backend or frontend test suite; `backend/tests` is empty |
| Postman | Notification collection exists and was corrected; no recording-specific collection exists |
| Frontend | React 19.2.6, React Router 7.18.1, Vite 8.0.16 |

Important files:

- `backend/app/main.py`
- `backend/app/database.py`
- `backend/app/authz.py`
- `backend/app/security.py`
- `backend/app/routes/auth.py`
- `backend/app/routes/notifications.py`
- `backend/app/routes/recordings.py`
- `backend/app/routes/session_recordings.py`
- `backend/app/routes/trainer_sessions.py`
- `backend/app/routes/websocket.py`
- `backend/app/routes/live_sessions.py`
- `backend/app/live/notification_gateway.py`
- `backend/app/live/connection_manager.py`
- `backend/app/live/helpers.py`
- `src/services/api.js`
- `src/pages/Notifications.jsx`
- `src/pages/RecordingDashboard.jsx`
- `src/pages/SessionRecordings.jsx`
- `src/pages/VirtualClassroom.jsx`
- `src/hooks/useLiveSession.js`
- `docs/notifications-api.md`
- `docs/notifications-postman-collection.json`

## 2. Requirement Verification Matrix

| Requirement | File/API | Status | Test performed | Actual result | Evidence | Fix required |
|---|---|---|---|---|---|---|
| Recipient-specific read state | `notification_receipts` | Completed and working | Created batch notification for two test students | Separate `_id`, `user_id`, `is_read`, `read_at` rows | MongoDB rows | No |
| Notification priorities/audiences | `NotificationCreate` | Completed and working | Valid and invalid enum payloads | Valid values accepted; invalid values returned 422 | API responses | No |
| Notification validation | `POST /api/notifications` | Completed and working | Empty/whitespace, bad enums, missing/invalid refs | 422 or 404 as appropriate | API responses | No |
| Notification pagination/filter/sort | `GET /api/notifications[/my]` | Completed and working | Search, priority, audience, read, batch/session/date, newest | Matching rows and totals returned | API responses | No |
| Batch/session ownership | Notification create + trainer session owner | Completed and working | Teacher targeted admin-owned batch | 403 | API response | No |
| Notification real-time delivery | `/api/notifications/ws` | Completed and working | Batch, classroom, personal, global, reconnect | `NEW_NOTIFICATION` received without refresh | WebSocket payload/browser DOM | No |
| WebSocket JWT and room isolation | Notification and live sockets | Completed and working | Invalid JWT, unrelated batch/classroom | Handshake rejected with HTTP 403 | WebSocket client | No |
| Offline notification retrieval | `GET /api/notifications/my` | Completed and working | Disconnected client then retrieved persisted rows | 200 with expected IDs | API response | No |
| Notification RBAC | Notification routes | Completed and working | Missing token, Student create/delete, owner/admin delete | 401/403/204 as expected | API responses | No |
| Recording metadata | `recordings` | Completed and working | Multipart upload and DB inspection | MIME, original name, size, duration, status, UTC fields persisted | MongoDB row | No |
| Recording ownership/enrollment | Recording access helpers | Completed and working | Foreign trainer, enrolled and unrelated students | 403/200/403 | API responses | No |
| Recording list/filter/sort | `GET /api/recordings` | Completed and working | Search, batch, trainer, session, status, page 1/2, latest | Correct rows, total, and ordering | API responses | No |
| Recording update protection | `PUT/PATCH /api/recordings/{id}` | Completed and working | Student edit, foreign trainer, protected fields | 403; protected fields unchanged | API and DB | No |
| Soft/permanent delete | `DELETE /api/recordings/{id}` | Completed and working | Teacher soft delete, Teacher/Admin permanent delete | 204/403/204; soft-delete retained media | API, DB, filesystem | No |
| Lifecycle transitions | Recording update | Completed and working | Pending→Processing→Encoding Completed→Ready; invalid reverse | Valid 200; invalid 409 | API responses | No |
| Secure playback | Playback-token and stream APIs | Completed and working | Enrolled/outsider, expired token, direct `/uploads` | 200/403/401/404 | API responses | No |
| HTTP ranges | Stream API | Completed and working | `Range: bytes=0-1023` | 206, Content-Range, Accept-Ranges, video MIME | Response headers | No |
| Browser playback/seeking | `SessionRecordings.jsx` | Completed and working | Real MP4 loaded and played; native seek-to-start | readyState 4, 48.5 s duration, no media error, end→0 seek | Browser state | No |
| Recording analytics | Recording document + summary API | Completed and working | Views, unique viewer, duration, last view, download, most viewed | Counts persisted; Student summary 403; Trainer/Admin 200 | API and DB | No |
| Processing/encoding worker | None | Missing | Repository and runtime inspection | States exist, but no worker changes them automatically | Code inventory | Yes, if production processing is required |
| Durable multi-instance event bus | None | Blocked by infrastructure | Architecture inspection | WebSockets are process-local | Code inventory | Yes for horizontal scaling |
| Automated regression suite | `backend/tests` | Missing | Repository inspection | No tests found | File inventory | Yes |

## 3. API Audit

| Method | Route | Controller | Authentication | Roles | Request tested | Status | Result/notes |
|---|---|---|---|---|---|---|---|
| POST | `/api/notifications` | `create_notification` | JWT | Teacher/Admin | Batch + session payload | 201 | Persisted receipts and emitted event |
| GET | `/api/notifications` | `list_notifications` | JWT | All authenticated, role-scoped | Combined filters | 200 | Pagination and newest sort verified |
| GET | `/api/notifications/my` | `list_my_notifications` | JWT | All authenticated | Student offline list | 200 | Only assigned rows |
| GET | `/api/notifications/unread-count` | `unread_count` | JWT | All | Student count | 200 | Correct count |
| PATCH | `/api/notifications/read-all` | `mark_all_read` | JWT | All | Student | 200 | Count became zero |
| GET | `/api/notifications/{id}` | `get_notification` | JWT | Authorized | Invalid ID | 404 | Standard detail |
| PATCH/PUT | `/api/notifications/{id}/read` | `mark_notification_read` | JWT | Assigned user | Owner/outsider | 200/403 | Only own receipt changed |
| PUT | `/api/notifications/{id}` | `update_notification` | JWT | Teacher owner/Admin | Title + priority | 200 | Updated |
| DELETE | `/api/notifications/{id}` | `delete_notification` | JWT | Teacher owner/Admin | Student/Teacher/Admin | 403/204/204 | Soft delete |
| WS | `/api/notifications/ws` | `notification_ws` | JWT query token | Authorized channel member | Batch/classroom/personal/global | Connected/rejected | `NEW_NOTIFICATION` verified |
| POST | `/api/recordings` | `create_recording` | JWT | Teacher/Admin | Pending metadata | 201 | Lifecycle record created |
| POST | `/api/recordings/upload` | `upload_recording` | JWT | Teacher/Admin | Real WebM multipart | 201 | DB + file persisted |
| GET | `/api/recordings` | `list_recordings` | JWT | All authenticated, scoped | Filters and pages | 200 | Access-correct totals |
| GET | `/api/recordings/{id}` | `get_recording` | JWT | Authorized | Enrolled/private/invalid | 200/403/404 | Correct |
| PUT/PATCH | `/api/recordings/{id}` | `update_recording` | JWT | Owner/Admin | Metadata/status/protected fields | 200/409/403 | Correct |
| DELETE | `/api/recordings/{id}` | `delete_recording` | JWT | Owner/Admin | Soft/permanent | 204/403 | Permanent is Admin-only |
| POST | `/api/recordings/{id}/playback[-token]` | `get_playback` | JWT | Authorized | Enrolled student | 200 | 30-minute token |
| GET | `/api/recordings/{id}/stream` | `stream_recording` | Playback token | Token holder | Range and expired token | 206/401 | Correct headers |
| POST | `/api/recordings/{id}/view` | `track_view` | JWT | Authorized | Two student events | 200 | Views/duration/unique persisted |
| GET | `/api/recordings/download/{id}` | `download_recording` | JWT | Authorized when enabled | Enabled/disabled | 200/403 | Download count changed only on allowed call |
| GET | `/api/recordings/analytics/summary` | `recording_analytics` | JWT | Teacher/Admin | Student/Trainer/Admin | 403/200/200 | Most-viewed returned |

## 4. Database Audit

MongoDB is schemaless; types below are the observed BSON/application types.

| Table/collection | Required field | Existing field | Type | Nullable | Relationship | Status/notes |
|---|---|---|---|---|---|---|
| notifications | ID | `_id`, `notification_id` | ObjectId/string | No | Receipt FK by string ID | Complete |
| notifications | Session | `session_id` | string | Yes | managed/trainer session | Complete |
| notifications | Batch | `batch_id` | string | Yes | trainer session batch name | Complete |
| notifications | Sender | `sender_id` | string | No | user/JWT subject | Complete |
| notifications | Title/message | `title`, `message` | string | No | — | Complete |
| notifications | Priority/audience | `priority`, `target_audience` | string enum | No | — | Complete |
| notifications | UTC/create/update | `created_at`, `updated_at` | BSON datetime | No | — | Complete |
| notifications | Soft delete | `is_deleted`, `deleted_at`, `deleted_by` | bool/datetime/string | Partly | — | Complete |
| notification_receipts | Recipient ID | `_id` | ObjectId | No | — | Complete |
| notification_receipts | Notification/user | `notification_id`, `user_id` | string | No | notification/user | Unique compound index |
| notification_receipts | Read state | `is_read`, `read_at` | bool/datetime | ReadAt yes | user-specific | Complete |
| notification_receipts | Delivery/create/update | `delivered_at`, `created_at`, `updated_at` | datetime | Delivered yes | — | Complete |
| recordings | IDs | `_id`, `recording_id` | ObjectId/string | No | — | Complete |
| recordings | Session/batch/trainer | `session_id`, `batch_id`, `trainer_id` | string | No | session/batch/user | Complete |
| recordings | Title/description | `recording_title`, `recording_description` | string | Description yes | — | Complete |
| recordings | Media URL/key | `video_file_url`, `stored_file_name` | string | Stored key yes for external metadata | local storage | Complete; physical path not returned |
| recordings | Thumbnail | `thumbnail_url` | string | Yes | — | Complete; no generator |
| recordings | Duration/size | `recording_duration`, `file_size` | string/int | No | — | Complete |
| recordings | Status/error | `recording_status`, `processing_error` | string/string | Error yes | lifecycle | Complete |
| recordings | Start/end/date | `recording_start_time`, `recording_end_time`, `recording_date` | datetime | Start/end yes | — | Complete |
| recordings | Playback/download | `playback_count`, `download_enabled`, `download_count` | int/bool/int | No | — | Complete |
| recordings | Visibility | `visibility` | enum string | No | batch/trainer access | Complete |
| recordings | MIME/original file | `mime_type`, `original_filename` | string | Yes for legacy rows | — | New uploads complete |
| recordings | Analytics | `viewer_ids`, `total_watch_duration`, `last_viewed_at` | list/int/datetime | Last yes | user IDs | Complete aggregate model |
| recordings | Audit/delete | `created_at`, `updated_at`, `is_deleted`, `deleted_at`, `deleted_by` | mixed | Delete fields yes | — | Complete |

## 5. Real-Time Verification

- Technology: FastAPI native WebSocket.
- Gateways: `backend/app/routes/notifications.py`,
  `backend/app/live/notification_gateway.py`.
- Event: `NEW_NOTIFICATION`.
- Channels: `all`, `batch_<id>`, `classroom_<id>`, `user_<id>`.
- Authentication: JWT signature, expiration, and role decoded before accept.
- Clients tested: Python `websockets` 16.0 and the real React page in the
  Codex in-app browser.
- Delivery: passed for batch, live classroom, global, and personal channels.
- Isolation: unrelated batch/classroom and invalid JWT handshakes were rejected.
- Reconnect: a disconnected and reconnected classroom client received the next
  event; the frontend also reconnects after close.
- Browser result: `TEST - Browser WebSocket Verified` appeared in the already
  open page without clicking Refresh.
- Limitation: the connection registry is process memory; multiple Uvicorn
  workers/hosts require a shared broker such as Redis.

## 6. Security and RBAC Results

| Operation | Trainer | Student | Admin | Expected | Actual |
|---|---|---|---|---|---|
| Create owned batch/class notification | Allow | Deny | Allow | 201/403/201 | Passed |
| Create global notification | Deny | Deny | Allow | 403/403/201 | Passed |
| Read assigned notification | Scoped | Assigned only | All | Scoped | Passed |
| Mark read | Own recipient only | Own recipient only | Own receipt if assigned | Scoped | Passed |
| Delete notification | Own | Deny | Any | 204/403/204 | Passed |
| Upload recording | Owned session | Deny | Allow | 201/403/201 | Passed |
| View public batch recording | Own/authorized | Enrolled only | All | Scoped | Passed |
| View private recording | Owner | Deny | Allow | 200/403/200 | Passed |
| Update recording | Owner | Deny | Any | 200/403/200 | Passed |
| Soft delete recording | Owner | Deny | Any | 204/403/204 | Passed |
| Permanent delete recording | Deny | Deny | Allow | 403/403/204 | Passed |
| Analytics summary | Own | Deny | All | 200/403/200 | Passed |

Authentication caveat: `/api/auth/demo-login` is intentionally unauthenticated
and public registration accepts a caller-selected role. Those development
features can issue privileged tokens and must be disabled or redesigned before
an Internet-facing production deployment.

## 7. Test Data Created

No passwords or tokens are included.

- Timestamp group: `2026-07-30T09:33:49Z` onward.
- Trainer: `6a6b1a7dbebaba0a941be373`.
- Student: `6a6b1a7dbebaba0a941be374`.
- Unrelated student: `6a6b1a7dbebaba0a941be375`.
- Admin: `6a6b1a7ebebaba0a941be376`.
- Primary batch/session:
  `TEST-BATCH-20260730093349` / `TEST-ROOM-20260730093349`.
- Recording sessions:
  `TEST-FIX-READY-20260730093349`,
  `TEST-FIX-LIFE-20260730093349`.
- Primary screenshot notification:
  `NTF-6A6B1DC4D74295DD30A63E93`.
- Classroom notification:
  `NTF-6A6B1C9DFA480B5D213056D9`.
- Primary uploaded recording:
  `REC-6A6B1C6EFA480B5D213056D2`.
- Browser-tested MP4:
  `REC-6A6B1AC5BEBABA0A941BE37C`.
- Lifecycle recording:
  `REC-6A6B1C6EFA480B5D213056D4`.

All intentional evidence rows remain in the development database. The orphan
file produced by the pre-fix duplicate-upload test was moved to a recoverable
temporary quarantine and is no longer in `backend/uploads`.

## 8. Screenshots Required

For every API screenshot, hide the Authorization header/token. For every DB
screenshot, hide password hashes, playback tokens, and physical paths.

| Filename | Open | Values that must be visible |
|---|---|---|
| `01_notification_database_entry.png` | MongoDB Compass → `notifications` | `NTF-6A6B1DC4D74295DD30A63E93`, session, batch, sender, title, message, Emergency, Batch, UTC dates |
| `02_notification_recipient_entries.png` | Compass → `notification_receipts`, filter notification ID | Two user IDs, `is_read`, `delivered_at`, `read_at`; mask emails/personal data |
| `03_create_notification_api.png` | Swagger/Postman POST `/api/notifications` | Method, URL, batch+session payload, 201, notification ID |
| `04_student_notification_list.png` | GET `/api/notifications/my?page=1&page_size=20` | Student auth context, item, pagination, batch/session |
| `05_notification_mark_read.png` | PATCH `/api/notifications/{id}/read` and Compass receipt | 200 plus updated `is_read/read_at` |
| `06_realtime_notification_event.png` | Browser console or WebSocket client | `NEW_NOTIFICATION`, `TEST - Browser WebSocket Verified`, batch/session, UTC timestamp |
| `07_notification_student_forbidden.png` | Student POST `/api/notifications` | 403 |
| `08_recording_database_entry.png` | Compass → `recordings` | `REC-6A6B1C6EFA480B5D213056D2`, session, batch, trainer, Ready, safe key/URL, duration, size, visibility, UTC created |
| `09_recording_upload_metadata.png` | POST `/api/recordings/upload` | Multipart field names, video filename, 201, recording ID |
| `10_recording_list_api.png` | GET `/api/recordings?status=Ready&batch_id=...&sort=latest` | Filters, pagination, latest order |
| `11_recording_details_api.png` | GET `/api/recordings/REC-6A6B1C6EFA480B5D213056D2` | Session, batch, trainer, status, duration, visibility |
| `12_secure_playback_token.png` | POST `/api/recordings/{id}/playback` | 200, playback URL, expiry; mask most of token |
| `13_recording_stream_range.png` | GET stream with `Range: bytes=0-1023` | 206, `Content-Range`, `Accept-Ranges`, `video/webm` or `video/mp4` |
| `14_recording_frontend_playback.png` | `/session-recordings` | Recording ID, session, duration, visible playing video |
| `15_recording_analytics.png` | GET `/api/recordings/analytics/summary` plus recording detail/DB | Total views, unique viewers, watch duration, last view, download count, most viewed |
| `16_recording_student_forbidden.png` | Student PUT or DELETE `/api/recordings/{id}` | 403 |

## 9. Defects Found and Fixed

| Defect | Severity | Root cause | Affected files | Fix | Retest |
|---|---|---|---|---|---|
| Delivery time never stored | Medium | Broadcast returned no delivered identities | notification gateway/routes | Track delivered user IDs and update receipts | Passed |
| Open student page did not receive events | High | No personal subscription in React | `Notifications.jsx`, gateway | Authorized `user_<id>` channel + reconnect | Browser passed |
| Teacher could target another batch/global audience | High | No session owner stored/enforced | trainer sessions/notifications | Persist owner and enforce scope | 403 passed |
| Public `/uploads` bypassed playback authorization | Critical | Unauthenticated StaticFiles mount | `main.py`, recordings | Removed public mount; use playback/download APIs | Direct request now 404 |
| Upload omitted MIME/original/error metadata | Medium | Fields were never persisted | recordings | Persist and return metadata | DB passed |
| Rejected upload left orphan file | Medium | File written before validation/without cleanup | recordings upload | Prevalidate and delete on exception | No new orphan |
| Status filter ignored | Medium | Query parameter absent | recordings list | Added validated `status` filter | Passed |
| Invalid lifecycle reversals allowed | High | Any enum value could replace current state | recordings update | Transition map + 409 | Passed |
| Teacher could permanently delete media | High | `permanent=true` lacked Admin check | recordings delete | Admin-only guard | 403/204 passed |
| Student pagination totals were inaccurate | Medium | Authorization was applied after DB pagination | recordings list | Add batch/visibility to DB query | Page 2 passed |
| Student UI exposed delete controls | Low | Frontend did not use role | `SessionRecordings.jsx` | Hide delete; disable unavailable download | Browser passed |
| Recording dashboard download omitted auth | Medium | Direct anchor request | `RecordingDashboard.jsx` | Authenticated blob download | Build passed |
| UTC response markers missing | Low | Motor returned naive datetimes | `database.py` | `tz_aware=True` | API returned `Z` |
| Notification docs/Postman were stale | Medium | Legacy DTO names/routes | notification docs/collection | Updated to current contract | JSON validated |

## 10. Remaining Issues

- No automated tests or configured test runner.
- `npm run lint` is blocked because ESLint 10 is installed but no
  `eslint.config.js` exists.
- No recording-specific Postman collection.
- No external object storage, transcoder, thumbnail generator, retry worker, or
  automated processing-state transitions.
- Analytics are aggregate fields, not an immutable per-view or per-download
  history; the API supports watch-duration events but the current UI records a
  view at playback start rather than periodically persisting progress.
- Existing legacy trainer sessions without `trainer_id` remain permissive to
  avoid breaking existing data; backfill ownership before production.
- Duplicate prevention is application-level, not a unique partial Mongo index,
  so simultaneous uploads for the same session still have a race window.
- WebSocket fan-out is in memory and is not durable across multiple processes.
- Demo login and caller-selected registration roles are development-only
  security risks.
- `/api/debug/mongo` is unauthenticated and exposes database metadata; it was
  outside the two-module change scope and was not modified.
- Actual screenshots were not saved by this audit; the exact capture checklist
  above is ready for the developer.

## Exact Manual Testing Instructions

### Start services and indexes

```powershell
cd C:\Users\ajith\classroom-chat
Get-Service MongoDB
Start-Service MongoDB  # only if it is stopped

cd .\backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env  # only when .env does not exist
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

There are no migrations. Startup calls `create_indexes()`. To run it explicitly:

```powershell
cd C:\Users\ajith\classroom-chat\backend
@'
import asyncio
from app.database import create_indexes
asyncio.run(create_indexes())
'@ | .\.venv\Scripts\python.exe -
```

Open Swagger at `http://127.0.0.1:8000/docs`.

Start the frontend (the same FastAPI process hosts both WebSocket services):

```powershell
cd C:\Users\ajith\classroom-chat
npm install
npm run dev
```

Open `http://localhost:5173`.

### Postman and JWTs

Import `docs/notifications-postman-collection.json` using Postman → Import →
File. There is no recording collection; use Swagger or add requests to the
imported collection.

Obtain local development tokens without printing them:

```powershell
$base = 'http://127.0.0.1:8000'
$trainer = Invoke-RestMethod "$base/api/auth/demo-login" -Method Post -ContentType 'application/json' -Body '{"role":"Teacher"}'
$student = Invoke-RestMethod "$base/api/auth/demo-login" -Method Post -ContentType 'application/json' -Body '{"role":"Student"}'
$admin = Invoke-RestMethod "$base/api/auth/demo-login" -Method Post -ContentType 'application/json' -Body '{"role":"Admin"}'
$trainerToken = $trainer.access_token
$studentToken = $student.access_token
$adminToken = $admin.access_token
```

For enrollment-isolation testing, use real `/api/auth/login` users with
`users.batch_id` populated; demo users intentionally bypass some development
checks.

### Identify IDs

Use these retained evidence values:

- Session: `TEST-ROOM-20260730093349`
- Batch: `TEST-BATCH-20260730093349`
- Trainer: `6a6b1a7dbebaba0a941be373`

Or call `GET /api/trainer-sessions` with a Teacher/Admin token.

### Create and receive a notification

POST `/api/notifications` in Swagger/Postman with:

```json
{
  "session_id": "TEST-ROOM-20260730093349",
  "batch_id": "TEST-BATCH-20260730093349",
  "title": "TEST - Live Class Started",
  "message": "Your live class has started. Please join the session.",
  "priority": "High",
  "target_audience": "Batch"
}
```

Connect a WebSocket client to:

```text
ws://127.0.0.1:8000/api/notifications/ws?token=<STUDENT_JWT>&channel=user_<STUDENT_USER_ID>
```

Do not show the full token in screenshots. Expect `NEW_NOTIFICATION`.

### Create, authorize, and stream a recording

Use Swagger `POST /api/recordings/upload` with the retained session, batch, the
authenticated trainer ID, title `TEST - Session Recording Verification`, a
duration, `Public Batch`, and a real video file.

Then:

1. POST `/api/recordings/{recordingId}/playback`.
2. Copy the returned relative playback URL and masked token.
3. Send `Range: bytes=0-1023` to that URL.
4. Expect 206, `Content-Range`, `Accept-Ranges: bytes`, and a video MIME type.
5. Open `/session-recordings`, click Play Recording, play the video, and use the
   native seek bar or Home key to verify seeking.

### Verify MongoDB rows

```powershell
cd C:\Users\ajith\classroom-chat\backend
@'
import asyncio
from app.database import notifications_collection, notification_receipts_collection, recordings_collection

async def main():
    notification_id = "NTF-6A6B1DC4D74295DD30A63E93"
    recording_id = "REC-6A6B1C6EFA480B5D213056D2"
    print(await notifications_collection.find_one({"notification_id": notification_id}, {"playback_token": 0}))
    print(await notification_receipts_collection.find({"notification_id": notification_id}).to_list(20))
    print(await recordings_collection.find_one({"recording_id": recording_id}, {"playback_token": 0, "stored_file_name": 0}))

asyncio.run(main())
'@ | .\.venv\Scripts\python.exe -
```

### Clean up only audit data

Take screenshots first. Then run a reviewed cleanup that selects only the
timestamped audit IDs/titles, deletes receipt rows before notifications, deletes
recording rows, removes only their recorded `stored_file_name` files, and
removes only `TEST-*20260730093349` sessions and
`audit-*-20260730093349@example.com` users. Do not use a broad collection drop
or delete production rows.

## 11. Final Conclusion

- Live Session Announcements & System Alerts: **Ready with minor known limitations**.
- Session Recording Management & Playback: **Ready with minor known limitations**.

Both local development flows are suitable for team demonstration. Production
submission still requires the security/configuration work listed under
Remaining Issues, especially privileged demo/auth flows, durable real-time
fan-out, storage/processing infrastructure, and automated tests.
