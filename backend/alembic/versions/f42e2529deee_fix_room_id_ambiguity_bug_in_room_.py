"""fix room_id ambiguity bug in room_members_insert

Revision ID: f42e2529deee
Revises: 857d854b9861
Create Date: 2026-09-04 01:59:43.612271

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f42e2529deee'
down_revision: Union[str, Sequence[str], None] = '857d854b9861'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CURRENT_USER_ID = "current_setting('app.current_user_id', true)::uuid"

# BUGGY_CHECK's middle clause has an unqualified `room_id` inside a subquery
# whose own FROM (room_members AS existing_membership) also has a room_id
# column. Postgres resolves the bare reference to the inner column instead
# of the outer row being inserted, silently degenerating the clause into
# "existing_membership.room_id = existing_membership.room_id" (always
# true), instead of "is the current user a member of the room this new row
# targets." The outer table needs to be qualified explicitly.
FIXED_CHECK = f"""
    (
        user_id = {CURRENT_USER_ID}
        AND EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id AND rooms.is_private = false
        )
    )
    OR EXISTS (
        SELECT 1 FROM room_members AS existing_membership
        WHERE existing_membership.room_id = room_members.room_id
        AND existing_membership.user_id = {CURRENT_USER_ID}
    )
    OR (
        user_id = {CURRENT_USER_ID}
        AND EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id AND rooms.owner_id = {CURRENT_USER_ID}
        )
    )
"""

BUGGY_CHECK = f"""
    (
        user_id = {CURRENT_USER_ID}
        AND EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id AND rooms.is_private = false
        )
    )
    OR EXISTS (
        SELECT 1 FROM room_members AS existing_membership
        WHERE existing_membership.room_id = room_id
        AND existing_membership.user_id = {CURRENT_USER_ID}
    )
    OR (
        user_id = {CURRENT_USER_ID}
        AND EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id AND rooms.owner_id = {CURRENT_USER_ID}
        )
    )
"""


def upgrade() -> None:
    op.execute("DROP POLICY room_members_insert ON room_members")
    op.execute(f"""
        CREATE POLICY room_members_insert ON room_members
        FOR INSERT
        WITH CHECK ({FIXED_CHECK})
    """)


def downgrade() -> None:
    op.execute("DROP POLICY room_members_insert ON room_members")
    op.execute(f"""
        CREATE POLICY room_members_insert ON room_members
        FOR INSERT
        WITH CHECK ({BUGGY_CHECK})
    """)
