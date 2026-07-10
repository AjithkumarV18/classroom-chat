# Role-Based Access Control Permission Matrix

Roles: Student, Teacher, Employer, Employee, Admin.

## Frontend Routes

| Route | Student | Teacher | Employer | Employee | Admin |
|---|---:|---:|---:|---:|---:|
| `/dashboard` | Yes | Yes | Yes | Yes | Yes |
| `/trainer-dashboard` | No | Yes | No | No | Yes |
| `/recordings` | No | Yes | No | No | Yes |
| `/session-recordings` | Yes | Yes | Yes | Yes | Yes |
| `/session-management` | No | Yes | No | No | Yes |
| `/virtual-classroom` | Yes | Yes | No | No | Yes |
| `/classroom` | Yes | Yes | No | No | Yes |

Unauthorized frontend users are redirected to `/access-denied`.
Unauthenticated users are redirected to `/`.

## Backend APIs

| API Group | Student | Teacher | Employer | Employee | Admin |
|---|---:|---:|---:|---:|---:|
| `/api/trainer-sessions` | No | Yes | No | No | Yes |
| `/api/managed-sessions` | No | Yes | No | No | Yes |
| `/api/recordings` | No | Yes | No | No | Yes |
| `/api/session-recordings` | Yes | Yes | Yes | Yes | Yes |
| `/api/auth/*` | Public | Public | Public | Public | Public |

Backend APIs are protected with JWT Bearer tokens and role checks from `app/authz.py`.

## Demo Logins

On the login page, leave Email and Password blank, choose a Demo Role, and click Login.
The frontend calls `POST /api/auth/demo-login` and stores the returned JWT/user role in localStorage.

Suggested checks:

1. Login as Admin: all protected pages should open.
2. Login as Teacher: trainer, recordings, session management, classroom pages should open.
3. Login as Student: classroom and session recordings should open; trainer/recordings/session management should redirect to Access Denied.
4. Login as Employer: only dashboard and session recordings should open.
5. Login as Employee: only dashboard and session recordings should open.
