"""add owner visibility branch to rooms_select

Revision ID: aa540383c056
Revises: 196d529dfcba
Create Date: 2026-09-04 16:37:29.567136

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'aa540383c056'
down_revision: Union[str, Sequence[str], None] = '196d529dfcba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CURRENT_USER_ID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # rooms_select had no owner-based branch: only `is_private = false` or
    # `is_room_member(id, ...)`. That's a bootstrapping deadlock for
    # creating a *private* room with an auto-added owner (FR-2): the room
    # isn't public, and the owner isn't a room_members row yet (that insert
    # happens in the next statement), so the brand-new row is invisible
    # under rooms_select to its own creator. Confirmed directly against
    # Postgres: an INSERT ... RETURNING into rooms as the owner of a new
    # private room raised "new row violates row-level security policy for
    # table rooms" -- not because WITH CHECK rejected it (a plain INSERT
    # with no RETURNING succeeds), but because RETURNING additionally
    # requires the new row to pass the SELECT policy. The same invisibility
    # then blocks room_members_insert's "are you this room's owner" EXISTS
    # check on rooms, since that's an ordinary read subject to rooms_select
    # too. Public rooms never hit this, since `is_private = false` alone
    # already makes them visible.
    op.execute("DROP POLICY rooms_select ON rooms")
    op.execute(f"""
        CREATE POLICY rooms_select ON rooms
        FOR SELECT
        USING (
            is_private = false
            OR owner_id = {CURRENT_USER_ID}
            OR is_room_member(id, {CURRENT_USER_ID})
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY rooms_select ON rooms")
    op.execute(f"""
        CREATE POLICY rooms_select ON rooms
        FOR SELECT
        USING (
            is_private = false
            OR is_room_member(id, {CURRENT_USER_ID})
        )
    """)
