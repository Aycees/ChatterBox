# ChatterBox

A multi-room, real-time chat system built with FastAPI, PostgreSQL, and WebSockets. Authenticated users create rooms, join rooms, and exchange messages in real time, with history persisted and paginated over REST.

The core exercise: authorization isn't just checked in application code, it's enforced **inside PostgreSQL** with Row-Level Security (RLS) policies, so a user cannot read a row they don't have access to even if the API layer has a bug.

Full requirements and acceptance criteria live in [`ChatterBox_Project_Spec.md`](ChatterBox_Project_Spec.md). RLS design decisions and trade-offs are written up in [`RLS_DESIGN.md`](RLS_DESIGN.md).

## Tech stack

| Layer | Choice |
|---|---|
| Language | Python 3.13 |
| Web framework | FastAPI |
| ASGI server | Uvicorn |
| Database | PostgreSQL 16 |
| DB access | SQLAlchemy 2.0 (async) + asyncpg |
| Migrations | Alembic |
| Validation | Pydantic v2 |
| Auth | PyJWT + bcrypt |
| Testing | pytest, pytest-asyncio, httpx.AsyncClient |
| Containers | Docker + docker-compose |
| Frontend | Next.js (React) + TanStack Query + Zod |
| Frontend testing | Vitest + React Testing Library |

## Project status

Implemented so far:
- Project scaffold, Docker Compose for Postgres **and** the API (`backend/Dockerfile`, migrations run automatically on container start), Alembic wired up (Phase 1)
- `users`, `rooms`, `room_members`, `messages` tables (Phase 2/3 data model)
- Registration, login, JWT issuing/verification, `GET /auth/me` (Phase 2)
- `app_user` restricted role with least-privilege grants, `FORCE ROW LEVEL SECURITY`, and the full policy set from spec section 4.4 on `rooms`, `room_members`, and `messages` (Phase 3)
- Room creation, joining, listing (own rooms and public rooms), and paginated message history (Phase 3)
- Automated test suite covering the auth flow, room membership rules, and RLS-specific tests proving policies hold even against a raw `app_user` connection (unit + integration)
- WebSocket real-time core: `/ws/rooms/{room_id}` with the auth-before-`accept()` ticket flow, an in-memory connection manager for fan-out, and `message`/`typing`/`presence` events over the spec's JSON envelope (Phase 4)
- Automated WebSocket tests (`tests/test_ws.py`): ticket rejection paths (missing, wrong-room, reused), message round-trip + persistence, typing relay excluding the sender, presence backfill for a client that joins a room already in progress, and unhandled-event-type error handling
- Frontend (Phase 5): auth pages (register/login, Zod-validated), a route-group layout that gates every page under it on being logged in, a rooms list (create/join/list own + public rooms), and a live chat view that does the ticket handshake and drives the room over a native `WebSocket` (message send/receive, typing indicator, presence). A 401 from any API call (expired/invalid JWT) clears the stored token and the app reacts by routing back to `/login` on its own, no separate "handle session expiry" code path
- Frontend test suite (Vitest + React Testing Library): validation schemas, the API client (auth header attachment, error-message parsing, 401-clears-token behavior), token storage (including cross-tab `storage` events), message-history pagination, the register form, and the WebSocket hook (ticket handshake, presence, typing, outgoing wire format) against a fake `WebSocket`
- `docker-compose.yml` runs all three services -- Postgres, API, and a production build of the frontend -- so `docker compose up --build` is genuinely one command end to end (Phase 5's "done" bar)

Known gap, not yet implemented:
- The WebSocket client doesn't reconnect on an unexpected drop, it just reports "Disconnected"

See section 6 of the spec for the full milestone breakdown.

## Prerequisites

- Python 3.11+
- Docker + Docker Compose
- Node.js 20+ and pnpm (for the frontend)

## Setup

1. **Clone and configure environment variables**

   Copy the example env file and fill in real values (or keep the defaults for local dev):

   ```bash
   cp .env.example .env
   ```

   | Variable | Purpose |
   |---|---|
   | `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credentials for the Postgres container |
   | `DATABASE_URL` | Connection string used for migrations, run under the table-owner role. Never used by the running API (see section 4.2 of the spec: the owner role bypasses RLS) |
   | `APP_DATABASE_URL` | Connection string the running API actually uses, as the restricted `app_user` role. This is the connection RLS policies apply to |
   | `APP_USER_PASSWORD` | Password for the `app_user` role, set when the `create_app_user_role_and_grants` migration runs. Generate one the same way as the JWT secret |
   | `JWT_SECRET_KEY` | Secret used to sign/verify JWTs. Generate a real one with `python -c "import secrets; print(secrets.token_hex(32))"` — never commit a real value |
   | `JWT_ALGORITHM` | JWT signing algorithm (defaults to `HS256`) |
   | `ACCESS_TOKEN_EXPIRE_MINUTES` | How long an access token stays valid |

2. **Run everything with Docker Compose**

   ```bash
   docker compose up --build
   ```

   This starts Postgres, the API, and the frontend together, end to end, one command. Postgres reports healthy before the API starts; the API container then runs `alembic upgrade head` automatically before starting Uvicorn, no separate migration step needed; the frontend runs a production build (`next build && next start`). Once it's up: the app is at `http://localhost:3000`, the API at `http://localhost:8000` (docs at `/docs`), Postgres at `localhost:5433`.

   **Local dev alternative:** if you'd rather run the API and/or frontend directly on your machine (hot-reload on save, easier debugging) while still using Postgres in a container:

   ```bash
   docker compose up -d postgres   # Postgres only

   # backend
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   alembic upgrade head
   uvicorn app.main:app --reload

   # frontend, in a separate terminal
   cd frontend
   cp .env.example .env.local   # NEXT_PUBLIC_API_URL, defaults to http://localhost:8000
   pnpm install
   pnpm dev
   ```

   This is what `DATABASE_URL`/`APP_DATABASE_URL` in `.env` point at by default (`localhost:5433`, the host-mapped port). The containerized `api` service in `docker-compose.yml` overrides both to reach Postgres over the internal Docker network (`postgres:5432`) instead, so the same `.env` works for either path without editing it. The backend also needs `CORS_ORIGINS` (in `.env`, defaults to `["http://localhost:3000"]`) to include wherever the frontend actually runs, or the browser blocks every request to the API, already covered by the default for both paths above.

## Running tests

**Backend** -- from `backend/`, with the virtual environment active and Postgres running:

```bash
pytest tests/ -v
```

Tests run against the same database configured in `.env`. Each test cleans up the rows it creates (see `tests/conftest.py`'s `_clean_tables` fixture), so it's safe to run repeatedly against your local dev database.

**Frontend** -- from `frontend/`:

```bash
pnpm test          # one-shot run
pnpm test:watch    # watch mode
```

These are unit/component tests (Vitest + jsdom + React Testing Library); nothing here needs the backend or Postgres running, `fetch` and `WebSocket` are mocked per test.

## API endpoints (implemented)

| Method | Path | Auth required | Purpose |
|---|---|---|---|
| POST | `/auth/register` | No | Create a user account |
| POST | `/auth/login` | No | Exchange credentials for a JWT access token |
| GET | `/auth/me` | Yes | Return the current authenticated user |
| POST | `/rooms` | Yes | Create a room; caller becomes owner |
| GET | `/rooms` | Yes | List rooms the current user belongs to |
| GET | `/rooms/public` | Yes | List joinable public rooms |
| POST | `/rooms/{room_id}/join` | Yes | Join a public room, or add another user to a private room you already belong to |
| GET | `/rooms/{room_id}/messages` | Yes | Paginated message history, newest-first, member-only |
| POST | `/rooms/{room_id}/ws-ticket` | Yes | Mint a short-lived (30s), single-use ticket for opening this room's WebSocket connection |
| WS | `/ws/rooms/{room_id}?ticket=<ticket>` | Ticket | Real-time messaging: send/receive `message`, `typing`, and `presence` events (spec section 5.2) |

**Note on `GET /rooms/{room_id}/messages`:** the spec (section 7) asks for either a 403 or a documented empty result set for a non-member. This endpoint returns 404 instead, a deliberate choice so a non-member can't distinguish "not a member" from "room doesn't exist." RLS enforces the actual data restriction at the database layer regardless (section 4.4); this 404 is purely about what the HTTP layer reveals.

**Note on the WebSocket ticket flow:** the WS endpoint doesn't take a JWT directly, browsers can't attach an `Authorization` header to a WS handshake, and putting a long-lived JWT in a query string tends to end up in access/proxy logs and browser history. So a client calls `POST /rooms/{room_id}/ws-ticket` (normal JWT auth) first, gets back a short-lived single-use `ticket`, and immediately opens the socket with that instead. See spec section 5.2 for the full rationale and flow.

See section 5 of the spec for the full planned API and WebSocket contract.

## Project structure

```
backend/
  app/
    api/          # routers (auth, rooms, ws) and dependencies (get_current_user, get_db, get_authenticated_db)
    core/         # settings, security (hashing, JWT), connection_manager (WS fan-out), ws_tickets (WS auth)
    db/           # SQLAlchemy base, async session (connects as app_user)
    models/       # SQLAlchemy ORM models (user, room, room_member, message)
    schemas/      # Pydantic request/response schemas, including the WS envelope shapes
    main.py       # FastAPI app entrypoint
  alembic/         # migrations, including app_user role/grants and RLS policies
  tests/           # pytest suite, including RLS-specific tests
docker-compose.yml # Postgres + API + frontend services
frontend/
  app/
    (protected)/   # route group: layout.tsx gates everything under it on being logged in
      page.tsx       # rooms list (create/join/list)
      rooms/[roomId]/page.tsx  # chat view (WS ticket handshake, messages, typing, presence)
    login/, register/         # public auth pages, outside the (protected) group
  lib/             # api client, auth context, token storage, validation schemas, room/message/WS hooks
```
