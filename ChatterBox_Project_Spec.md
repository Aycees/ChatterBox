# Real-Time Chat System

**ChatterBox — Capstone Project Specification — Python / FastAPI / PostgreSQL RLS / WebSockets / Next.js**

- **Level:** Intermediate backend dev, new to Python
- **Estimated effort:** 2–3 weeks (part-time)
- **Format:** Self-directed build, graded against acceptance criteria
- **Deliverable:** Git repo + working Docker Compose stack

## 0. Overview

You are building **ChatterBox**: a multi-room, real-time chat messaging system. Authenticated users can create rooms, join rooms, exchange messages instantly over WebSockets, and load message history over a REST API.

The twist that makes this a genuine backend-security exercise: access control is not only enforced in your Python code — it is enforced **inside PostgreSQL itself** using Row-Level Security (RLS) policies, so that a user physically cannot read a row they are not authorized to see, even if a future version of your API code has a bug.

Treat this document like an exam brief: read the functional requirements, build against them, and self-check your work against the Acceptance Criteria in Section 6 before you consider a milestone done.

## 1. Learning Objectives

By the end of this project you should be able to:

- Structure a real Python project: virtual environments, dependency management, package layout, type hints, and async/await.
- Build a REST API with **FastAPI**: routing, dependency injection, Pydantic v2 schemas, request validation, and automatic OpenAPI docs.
- Design and enforce authorization at the database layer using **PostgreSQL Row-Level Security** — not just `WHERE` clauses in application code.
- Implement bidirectional real-time communication with native **WebSockets** in FastAPI, including connection lifecycle and broadcast fan-out.
- Use **SQLAlchemy 2.0 (async)** or asyncpg to talk to Postgres, and manage schema changes with **Alembic** migrations.
- Implement stateless authentication with **JWT** and secure password storage with **bcrypt**.
- Write automated tests with **pytest / pytest-asyncio / httpx**, including tests that prove your RLS policies actually work.
- Containerize the whole stack with **Docker** and **docker-compose** so it runs with one command.

## 2. Tech Stack

### Required

| Layer | Choice | Why |
|---|---|---|
| Language | Python 3.11+ | Type hints, dataclasses/Pydantic models, async/await throughout. |
| Web framework | FastAPI | Routing, dependency injection, WebSocket support, auto OpenAPI docs. |
| ASGI server | Uvicorn | Runs the FastAPI app; supports WebSocket upgrade natively. |
| Database | PostgreSQL 15+ | Your RLS policies live here — this is the star of the project. |
| DB access | SQLAlchemy 2.0 (async) + asyncpg | Or raw asyncpg if you want a more low-level challenge. |
| Migrations | Alembic | Version-controlled schema changes, including RLS policy DDL. |
| Validation | Pydantic v2 | Request/response schemas, settings management. |
| Auth | PyJWT or python-jose + passlib[bcrypt] | Access tokens; never store plaintext passwords. |
| Realtime | FastAPI native WebSockets | No extra library required for the core feature. |
| Testing | pytest, pytest-asyncio, httpx.AsyncClient | Unit + integration tests, including RLS-specific tests. |
| Containers | Docker + docker-compose | One command spins up API + Postgres. |
| Frontend | Next.js (React) | Login form, room list, message pane. Client-side `fetch()` for REST calls and the native WebSocket API (or a thin wrapper) for live updates. |
| Data fetching | TanStack Query | Server-state caching, refetching, and invalidation for REST calls (rooms, message history), separate from the WebSocket-driven live message state. |

### Optional / Bonus

- **Redis** — pub/sub so message broadcasts work correctly across multiple API processes/instances, and for tracking online presence.
- **Nginx** — reverse proxy in front of Uvicorn, terminating and forwarding WebSocket upgrades.
- **slowapi** — per-user rate limiting on message sends.
- **structlog** — structured JSON logging.
- **GitHub Actions** — CI pipeline that runs your test suite on every push.

## 3. Functional Requirements

| ID | Requirement | Details |
|---|---|---|
| FR-1 | Registration & Login | Users register with email, username, and password. Passwords are hashed with bcrypt — never stored or returned in plaintext. Login returns a signed JWT access token. |
| FR-2 | Create Rooms | Authenticated users can create a chat room with a name and an `is_private` flag. The creator is automatically added to `room_members` as the room owner. |
| FR-3 | Join / List Rooms | Users can browse and join public rooms. Private rooms can only be joined if explicitly added by an existing member. Users can list only the rooms they belong to. |
| FR-4 | Message History (REST) | `GET /rooms/{room_id}/messages` returns paginated history, newest-first, but only if the requester is a member of that room. |
| FR-5 | Real-Time Messaging (WebSocket) | Clients connect to a per-room WebSocket endpoint, authenticated via their JWT. The server verifies room membership before accepting the connection, then persists and broadcasts every message to all currently-connected members of that room. |
| FR-6 | Presence | Track which members are currently connected to a room; broadcast join/leave events to the room when a client connects or disconnects. |
| FR-7 | Typing Indicator (bonus) | An ephemeral WebSocket event (not persisted to the database) that tells other room members someone is typing. |
| FR-8 | RLS-Enforced Data Access | Row-Level Security policies on `rooms`, `room_members`, and `messages` guarantee that a query executed as a given user can only ever return rows that user is entitled to see — enforced by Postgres, independent of application code. |
| FR-9 | Minimal Frontend | A Next.js app with a login page, a room list, a message pane, and an input box. Uses TanStack Query (backed by `fetch()`) for REST calls and the native WebSocket API for live updates. |

## 4. Data Model & Row-Level Security

### 4.1 Core tables

| Table | Key columns |
|---|---|
| `users` | `id` (uuid, pk), `username`, `email`, `password_hash`, `created_at` |
| `rooms` | `id` (uuid, pk), `name`, `is_private` (bool), `owner_id` (fk users), `created_at` |
| `room_members` | `room_id` (fk rooms), `user_id` (fk users), `role`, `joined_at` — composite pk (`room_id`, `user_id`) |
| `messages` | `id` (uuid, pk), `room_id` (fk rooms), `sender_id` (fk users), `content`, `created_at` |

### 4.2 The RLS gotcha nobody warns you about

> **Table owners bypass RLS by default.**
> If your API connects to Postgres as the same role that owns the tables (e.g. the role that ran the migrations), RLS policies are silently ignored. Create a dedicated, non-superuser role (e.g. `app_user`) that your FastAPI app connects as for normal request traffic, run `ALTER TABLE ... FORCE ROW LEVEL SECURITY`, and keep migrations running under a separate owner/admin role.

### 4.3 Session identity pattern

Policies need to know "who is asking" for the current query. The standard pattern: after authenticating a request (decoding the JWT) and opening a DB transaction, set a transaction-local Postgres setting with the current user's id, then reference it inside your policies via `current_setting()`.

```sql
-- once per request, inside the transaction:
SET LOCAL app.current_user_id = '3f2a1e...';

-- inside a policy definition:
USING ( current_setting('app.current_user_id', true)::uuid = user_id )
```

In FastAPI, do this inside a dependency that wraps every protected route (and inside your WebSocket handler right after the connection is accepted) so it happens exactly once per request/connection, before any query touches a protected table.

### 4.4 Policies you must implement

- **`room_members`**: a user may `SELECT` their own membership rows, and rows for rooms they belong to (to see the member list); a user may only `INSERT` a membership row for themself, and only into a public room, or a private room where they were added by an existing member/owner.
- **`rooms`**: a user may `SELECT` a room if it is public, OR if they are a member of it. Only the owner may `UPDATE`/`DELETE` a room.
- **`messages`**: a user may `SELECT` or `INSERT` a message only for a room they are currently a member of. A user may only `INSERT` a message with their own id as `sender_id`.

Write these as real `CREATE POLICY` statements in an Alembic migration — not as comments or app-level checks you promise to remember to add everywhere.

## 5. API & WebSocket Contract

### 5.1 REST endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create a user account. |
| POST | `/auth/login` | Exchange credentials for a JWT access token. |
| GET | `/auth/me` | Return the current authenticated user. |
| POST | `/rooms` | Create a room (caller becomes owner). |
| GET | `/rooms` | List rooms the current user belongs to. |
| GET | `/rooms/public` | List joinable public rooms. |
| POST | `/rooms/{room_id}/join` | Join a public room, or accept membership in a private one. |
| GET | `/rooms/{room_id}/messages` | Paginated history (member-only, enforced by RLS). |

### 5.2 WebSocket endpoint

`WS /ws/rooms/{room_id}?token=<jwt>`

- On connect: validate the JWT, then verify room membership **before** calling `accept()`. Reject with an appropriate close code if either check fails.
- All messages exchanged over the socket use a single JSON envelope so the client only needs one parser.

```json
{ "type": "message", "payload": { "content": "hey team" } }
{ "type": "typing", "payload": { "user_id": "..." } }
{ "type": "presence", "payload": { "user_id": "...", "status": "online" } }
{ "type": "error", "payload": { "detail": "not a member of this room" } }
```

Maintain an in-memory connection manager (e.g. `dict[room_id, set[WebSocket]]`) so an incoming `message` event can be persisted to Postgres and then fanned out to every socket currently subscribed to that room.

## 6. Suggested Milestones

| Phase | Focus | What "done" looks like |
|---|---|---|
| 1 | Foundations | Project scaffold, venv, FastAPI "hello world", Docker Compose for Postgres, Alembic wired up. |
| 2 | Auth & Users | Register/login endpoints, password hashing, JWT issuing & verification dependency. |
| 3 | Rooms & RLS | Rooms/membership tables, `app_user` role, RLS policies, and tests that prove they hold. |
| 4 | Real-Time Core | WebSocket endpoint, connection manager, broadcast + persistence, message history endpoint. |
| 5 | Frontend & Polish | Minimal Next.js chat UI (TanStack Query for REST, native WebSocket for live updates), presence/typing (bonus), README, `docker-compose up` works end-to-end. |

## 7. Acceptance Criteria

Self-grade against this checklist before calling the project complete.

- [ ] Registering with a duplicate email or username returns 409, not 500.
- [ ] Passwords are hashed with bcrypt; no endpoint ever returns a password or `password_hash`.
- [ ] Every protected REST route and the WebSocket handshake reject missing/invalid/expired JWTs with 401 (or the equivalent WS close code).
- [ ] `GET /rooms/{room_id}/messages` returns 403 (or an empty result set, documented either way) for a non-member.
- [ ] **RLS proof:** connecting to Postgres directly as the `app_user` role and running a raw `SELECT` against `messages` or `rooms` for a room the session's `app.current_user_id` does not belong to returns zero rows — even though no application code ran.
- [ ] A superuser/table-owner connection is confirmed to still see everything, demonstrating you understand why the app must connect as a restricted role.
- [ ] A WebSocket connection attempt for a room the caller is not a member of is rejected before `accept()`.
- [ ] A message sent by client A over WebSocket is received by client B (same room, different connection) in well under a second on localhost, and is persisted — reloading history shows it.
- [ ] Message history is correctly paginated and ordered (newest-first or oldest-first, documented).
- [ ] A client that disconnects and reconnects can fetch messages sent while it was offline via the REST history endpoint.
- [ ] `docker-compose up` starts the API and Postgres together; migrations either run automatically or via one documented command.
- [ ] README documents setup, required environment variables, and how to run the test suite.
- [ ] Automated tests cover: auth flow, room membership rules, and at least one RLS-specific test per policy in Section 4.4 — and the suite passes.

## 8. Stretch Goals

Optional, for extra depth once the core is solid:

- Redis pub/sub so broadcasts work correctly when you run two Uvicorn workers/instances at once.
- Read receipts / unread-message counts per room.
- Message editing and soft-delete, with an `edited_at` timestamp.
- File/image attachments (store in object storage, not the DB).
- Per-user rate limiting on message sends (slowapi).
- A GitHub Actions workflow that runs the test suite on every push.

## 9. Evaluation Rubric

| Category | Weight | What's being judged |
|---|---|---|
| Correctness & functionality | 30% | REST + WebSocket features work as specified end-to-end. |
| RLS & security | 25% | Policies are correct, forced, tested, and app connects as a restricted role. |
| WebSocket implementation | 20% | Clean connection lifecycle, correct auth-before-accept, reliable broadcast. |
| Code quality & structure | 15% | Clear project layout, type hints, sensible use of async, readable code. |
| Docs & Docker setup | 10% | One-command startup, clear README, reproducible environment. |

## 10. Deliverables

- A Git repository with a clear structure (e.g. `app/`, `tests/`, `alembic/`, `frontend/` as a Next.js app).
- `README.md` covering setup, environment variables, and how to run tests.
- `.env.example` and `docker-compose.yml`.
- Test suite under `tests/`, passing.
- A short (~1 page) write-up of your RLS design decisions and any trade-offs you made.

---

*End of specification.*
