# RLS Design Write-Up

How authorization is enforced in ChatterBox, and the trade-offs and bugs hit building it. Covers spec section 4 (RLS Design) and the section 10 deliverable.

## The core model

The running API never connects to Postgres as the table owner. `app/db/session.py` always opens connections via `APP_DATABASE_URL`, a dedicated `app_user` role created in `55a110390756_create_app_user_role_and_grants.py` with only the grants each table actually needs (`SELECT, INSERT` on `users`; `SELECT, INSERT, UPDATE, DELETE` on `rooms`; `SELECT, INSERT` on `room_members` and `messages`, no update/delete on either, since neither is ever edited in place). `rooms`, `room_members`, and `messages` all have `ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY` (`9ab66ac6d14a`).

The gotcha this guards against (spec 4.2): Postgres exempts a table's *owner* from its own RLS policies by default, `ENABLE` alone doesn't change that, only `FORCE` does. `app_user` is deliberately not that owner (migrations run under a separate `DATABASE_URL`/admin role), so it's already fully governed by every policy without needing `FORCE` at all, `FORCE` is what closes the same loophole for the owner/admin role itself, should anything ever query through that connection directly. It does *not* help against a superuser, though: superusers bypass RLS unconditionally, `FORCE` included. That's exactly why the acceptance criteria ask you to confirm a superuser connection still sees everything (`test_admin_connection_sees_rows_app_user_cannot`), the real safety property here isn't `FORCE`, it's the contract that the application itself must never authenticate as that role.

Every request that touches one of those tables runs `SELECT set_config('app.current_user_id', :id, true)` first (`get_authenticated_db` in `app/api/deps.py`), scoped to the transaction (`true` = local). Every policy reads that same setting via `current_setting('app.current_user_id', true)::uuid`. If it's never set, the cast fails closed rather than reading anyone else's rows.

## What each policy set enforces

- **`rooms`**: `SELECT` allows a public room, a room you own, or a room you're a member of. `INSERT` requires `owner_id = you`. `UPDATE`/`DELETE` are owner-only.
- **`room_members`**: `SELECT` allows your own membership rows plus every membership row for a room you're already in (so you can see a room's member list). `INSERT` allows exactly two shapes: joining yourself to a room that's public, or an existing member/owner adding someone else, this is the only path a private room gets new members through; there's no "request to join" for private rooms.
- **`messages`**: `SELECT`/`INSERT` both require current membership in the room; `INSERT` additionally requires `sender_id = you`, so nobody can post as anyone else even with a valid session.

## Bugs hit along the way (the real trade-offs)

**Infinite recursion.** `room_members_select`'s own `USING` clause reads `room_members` to check "are you in any room this row's room belongs to." Under `FORCE ROW LEVEL SECURITY`, that inner read is itself filtered by `room_members_select`, so evaluating the policy re-triggers the same policy, Postgres raises "infinite recursion detected in policy for relation room_members." The same shape existed in `rooms_select`, `room_members_insert`, and `messages_select`/`insert`. Confirmed empirically that Postgres does not reliably short-circuit even when an earlier `OR` branch already matches, it recurred on a plain public-room insert that should never have touched the membership branch at all.

Fix (`196d529dfcba`): a `SECURITY DEFINER` helper, `is_room_member(room_id, user_id)`. It runs with the privileges of whoever created it (the migration/owner role, which bypasses RLS), so its internal read of `room_members` never re-invokes `room_members_select`. This is a deliberate, narrow escape hatch from RLS, not a general one: it's `STABLE`, takes exactly the two IDs it needs, returns a boolean, and `app_user` only has `EXECUTE` on it, nothing broader. Any `SECURITY DEFINER` function is worth being suspicious of by default; the trade-off here is accepting one narrowly-scoped exception to get correct, non-recursive membership checks everywhere else.

**A bootstrapping deadlock for private rooms.** `rooms_select` originally allowed `is_private = false OR is_room_member(id, ...)`, nothing else. Creating a *private* room (`create_room` in `rooms.py`) inserts the room, then inserts the owner's `room_members` row, in that order, so at the moment the room is created, the owner isn't a member yet and the room isn't public. The insert's own `RETURNING` clause turned out to *also* require the new row to pass the `SELECT` policy (a plain `INSERT` with no `RETURNING` succeeds; adding `RETURNING` doesn't), so creating your own private room failed with "new row violates row-level security policy for table rooms", not because `WITH CHECK` rejected it, but because the row was invisible to its own creator immediately after. Fix (`aa540383c056`): add `owner_id = current_user_id` as its own branch in `rooms_select`. Public rooms never hit this, `is_private = false` alone already made them visible.

**A silently-wrong policy, not a loudly-broken one.** `room_members_insert`'s "are you already a member of this room" clause referenced a bare `room_id` inside a subquery whose own `FROM` (`room_members AS existing_membership`) also has a `room_id` column. Postgres resolved the unqualified reference to the *inner* column, degenerating the clause into `existing_membership.room_id = existing_membership.room_id`, always true, instead of comparing against the row actually being inserted. This didn't error; it just quietly over-permitted. Fix (`f42e2529deee`): qualify the outer reference explicitly (`room_members.room_id`). The lesson worth keeping in mind: an RLS bug is more likely to silently grant access than to loudly deny it, column-scoping mistakes inside a policy don't get caught by anything except a test that actually asserts the *denial* case, not just the allow case.

## A deliberate deviation from the spec

`GET /rooms/{room_id}/messages` returns `404` for a non-member, not the `403` (or documented empty set) the spec's acceptance criteria describe. This is intentional: a `403` confirms the room exists to someone who isn't in it, `404` doesn't. RLS enforces the actual data restriction at the database layer regardless of which HTTP status the route chooses to return, this is purely about what the API layer reveals to a non-member. Documented in the README and in `_require_membership`'s docstring.

## Known limitations

- **Offset-based pagination** (`rooms.py:list_messages`) is simple and fine at this scale, but a cursor on `(created_at, id)` would hold up better under concurrent inserts shifting offsets mid-scroll.
- **WS tickets and the connection registry are in-memory** (`ws_tickets.py`, `connection_manager.py`), so they don't survive a process restart and don't work across multiple API processes/workers. Fine for one Uvicorn worker; the spec's stretch goals (section 8) call out Redis pub/sub as the fix for running more than one.
