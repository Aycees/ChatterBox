# User Directory & Room Invites

Branch: `feat/user-directory-invites`. Two commits: `backend` (b9d7f1d) and `frontend` (e2989f9).

## What this is

A user directory page plus a pending invite/accept flow for rooms, per the 5 acceptance criteria:

1. Searchable user directory (username or email).
2. Invite button on each user row.
3. A "who invited me" component showing pending invites addressed to you.
4. The user listing itself.
5. Clicking Invite opens a modal to pick one of your **owned** rooms.

This wasn't in `ChatterBox_Project_Spec.md` (no invites table, no `/users` endpoint). The existing "invite" mechanism in the spec (`POST /rooms/{room_id}/join` with a `user_id`) is an **immediate add**, no accept step. This feature is a genuine extension: a new `room_invites` table with `pending`/`accepted`/`declined` state, its own RLS policies, and two extensions to the existing `rooms`/`room_members` RLS policies (details below).

## Data model

New table `room_invites` (migration `e539495125d5`):

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `room_id` | fk `rooms.id` |
| `invited_user_id` | fk `users.id` |
| `invited_by_id` | fk `users.id` |
| `status` | `pending` / `accepted` / `declined`, CHECK-constrained |
| `created_at` | server default now() |
| `responded_at` | nullable, set on accept/decline |

Constraints: `invited_user_id != invited_by_id` (no self-invites), and a **partial unique index** on `(room_id, invited_user_id) WHERE status = 'pending'` — only one live invite per room/user pair at a time; a new one can be sent once the old one is resolved.

## RLS design

- **`room_invites_select`**: visible to the invitee (`invited_user_id`) or the inviter (`invited_by_id`).
- **`room_invites_insert`**: only the room's **owner** can create an invite for it (`invited_by_id = you AND you own the room`). This is a product decision, not spec-mandated: the invite modal only offers owned rooms, so this enforces the same rule at the DB layer. A plain member (non-owner) cannot invite, even though they can add someone directly via the existing `/join` endpoint.
- **`room_invites_update`**: only the invitee can update their own invite row (`invited_user_id = you`). Combined with a **column-level GRANT** (`GRANT UPDATE (status, responded_at)`), the invitee can flip status but can never repoint `room_id`/`invited_by_id`/`invited_user_id`, regardless of what a route handler sends.

Two existing policies needed extensions, both real landmines that would've silently broken the feature if missed:

1. **`rooms_select`** gained a branch: `OR EXISTS (pending invite for this room to you)`. Without it, an invitee can't see the room they're being invited to (its name, etc.) until *after* they've already joined — backwards. Same shape as the earlier owner-visibility fix in `aa540383c056`.
2. **`room_members_insert`** gained a branch: self-insert is allowed if there's an `accepted` invite row for `(room_id, you)`. This is the actual crux of the whole feature — accepting an invite to a **private** room means inserting yourself into `room_members` while you're not a member yet, which neither of the two existing branches (public-room self-join, or "an existing member added you") covers. The accept endpoint flips the invite to `accepted` and inserts the membership row in the same DB transaction, so Postgres sees its own uncommitted write when it evaluates the new branch.

Both extensions, and the whole `room_invites` policy set, are exercised by `test_invites.py`, including a direct-SQL RLS proof (`test_app_user_direct_select_on_room_invites_hidden_from_bystander`) and a test that specifically targets the private-room accept path (`test_accept_invite_to_private_room_adds_membership`).

## Backend

| Endpoint | Notes |
|---|---|
| `GET /users?search=&limit=` | Directory. `users` has no RLS (per spec 4.4, only `rooms`/`room_members`/`messages` are protected), so this is a plain filtered query. Excludes the caller. Never returns `password_hash` (`UserOut` never did). |
| `POST /rooms/{room_id}/invites` | Owner-only (enforced by RLS + app-layer checks for clearer error codes: 400 self-invite, 404 unknown user, 409 already a member, 409 duplicate pending invite, 403 not the owner). |
| `GET /invites/me` | Pending invites addressed to you, joined with room name + inviter username. |
| `POST /invites/{id}/accept` | Flips status, inserts `room_members` row, same transaction. 404 if not yours, 409 if already responded. |
| `POST /invites/{id}/decline` | Flips status only. |

New files: `app/models/room_invite.py`, `app/schemas/invite.py`, `app/api/routes/users.py`, `app/api/routes/invites.py`. `POST /rooms/{room_id}/invites` lives in the existing `rooms.py` router, alongside the existing `/join` endpoint it parallels.

Deliberately not built (kept in scope): canceling/withdrawing a sent invite, listing all invites for a room (only "my pending invites" was asked for).

## Frontend

- `/users` (`app/(protected)/users/page.tsx`) — search input (300ms debounce), user list, Invite button per row.
- `invite-modal.tsx` (same folder) — lists the caller's **owned** rooms only (filtered client-side from `useMyRooms()` by `owner_id`), radio-select, submit.
- Room list page (`(protected)/page.tsx`) gained an "Invitations" section above "Your rooms": pending invites with Accept/Decline. Accept invalidates both the invites and rooms queries (a new room appears).
- Nav link to `/users` added to the protected layout header.
- New hooks: `lib/use-users.ts` (`useUsers(search)`), `lib/use-invites.ts` (`useMyInvites`, `useCreateInvite`, `useAcceptInvite`, `useDeclineInvite`).
- Matches the app's current actual styling (hand-typed Tailwind, `bg-foreground`/`border-black/10` etc.) — the `design-system/DESIGN_SYSTEM.md` token/component system (`accent`, `Card`, `Button`...) hasn't been merged into `globals.css` yet, so using those classes would have pointed at undefined tokens.

## Verified

- Backend: `pytest` — 73 passed (17 new: `test_users.py`, `test_invites.py`), including the RLS proofs above.
- Frontend: `tsc --noEmit` clean, `eslint` clean, `vitest run` — 34 passed (no regressions).
- End-to-end smoke test against a locally-run instance (separate ports, didn't touch the running `docker compose` stack): registered two users, alice created a private room, searched the directory for bob, invited him, confirmed bob could see the invite (with room name + inviter username) and *could not* see the room yet, accepted it, confirmed the room then appeared in his room list and the invite disappeared from his pending list. Test data cleaned up afterward.
- Did not browser-test the actual UI (a live, non-isolated Chrome window was already attached to the devtools session — didn't want to risk driving the user's real browser). The API-level flow above is what the UI calls; `tsc`/`eslint` catch the wiring, but the modal/search/accept UI itself hasn't been eyeballed in a browser.

## Not done / worth knowing

- No way to cancel a sent invite, or see invites you've sent (only received). Add `GET /rooms/{room_id}/invites` + a cancel endpoint if that's wanted later.
- Search is a plain `ILIKE '%term%'`, no pagination beyond a `limit` cap (default 50, max 100).
- The invite modal doesn't currently surface "you already have a pending invite out to this person for this room" before submit — it'll show the 409 from the server after clicking Send.
