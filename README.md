# ChatterBox

A multi-room, real-time chat system built with FastAPI, PostgreSQL, and WebSockets. Authenticated users create rooms, join rooms, and exchange messages in real time, with history persisted and paginated over REST.

The core exercise: authorization isn't just checked in application code, it's enforced **inside PostgreSQL** with Row-Level Security (RLS) policies, so a user cannot read a row they don't have access to even if the API layer has a bug.

Full requirements and acceptance criteria live in [`ChatterBox_Project_Spec.md`](ChatterBox_Project_Spec.md).

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
| Frontend | Next.js (React) + TanStack Query |

## Project status

Implemented so far:
- Project scaffold, Docker Compose for Postgres, Alembic wired up (Phase 1)
- `users`, `rooms`, `room_members`, `messages` tables (Phase 2/3 data model)
- Registration, login, JWT issuing/verification, `GET /auth/me` (Phase 2)
- `app_user` restricted role with least-privilege grants, `FORCE ROW LEVEL SECURITY`, and the full policy set from spec section 4.4 on `rooms`, `room_members`, and `messages` (Phase 3)
- Room creation, joining, listing (own rooms and public rooms), and paginated message history (Phase 3)
- Automated test suite covering the auth flow, room membership rules, and RLS-specific tests proving policies hold even against a raw `app_user` connection (unit + integration)

Not yet implemented: the WebSocket real-time core (Phase 4) and the frontend (Phase 5). See section 6 of the spec for the full milestone breakdown.

## Prerequisites

- Python 3.11+
- Docker + Docker Compose
- Node.js (for the frontend, once it's built out)

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

2. **Start Postgres**

   ```bash
   docker compose up -d postgres
   ```

3. **Set up the backend virtual environment and install dependencies**

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

4. **Run database migrations**

   ```bash
   alembic upgrade head
   ```

5. **Run the API**

   ```bash
   uvicorn app.main:app --reload
   ```

   The API is now at `http://127.0.0.1:8000`, with interactive docs at `http://127.0.0.1:8000/docs`.

## Running tests

From `backend/`, with the virtual environment active and Postgres running:

```bash
pytest tests/ -v
```

Tests run against the same database configured in `.env`. Each test cleans up the rows it creates (see `tests/conftest.py`'s `_clean_tables` fixture), so it's safe to run repeatedly against your local dev database.

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

**Note on `GET /rooms/{room_id}/messages`:** the spec (section 7) asks for either a 403 or a documented empty result set for a non-member. This endpoint returns 404 instead, a deliberate choice so a non-member can't distinguish "not a member" from "room doesn't exist." RLS enforces the actual data restriction at the database layer regardless (section 4.4); this 404 is purely about what the HTTP layer reveals.

See section 5 of the spec for the full planned API and WebSocket contract.

## Project structure

```
backend/
  app/
    api/          # routers (auth, rooms) and dependencies (get_current_user, get_db, get_authenticated_db)
    core/         # settings, security (hashing, JWT)
    db/           # SQLAlchemy base, async session (connects as app_user)
    models/       # SQLAlchemy ORM models (user, room, room_member, message)
    schemas/      # Pydantic request/response schemas
    main.py       # FastAPI app entrypoint
  alembic/         # migrations, including app_user role/grants and RLS policies
  tests/           # pytest suite, including RLS-specific tests
docker-compose.yml # Postgres service
frontend/          # Next.js app (scaffolded, not yet built out)
```
