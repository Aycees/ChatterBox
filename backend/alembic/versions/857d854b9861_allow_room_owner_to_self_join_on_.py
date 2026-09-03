"""allow room owner to self join on creation

Revision ID: 857d854b9861
Revises: 9ab66ac6d14a
Create Date: 2026-09-04 01:58:38.427833

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '857d854b9861'
down_revision: Union[str, Sequence[str], None] = '9ab66ac6d14a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CURRENT_USER_ID = "current_setting('app.current_user_id', true)::uuid"

OLD_CHECK = f"""
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
"""

NEW_CHECK = f"""
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
        WITH CHECK ({NEW_CHECK})
    """)


def downgrade() -> None:
    op.execute("DROP POLICY room_members_insert ON room_members")
    op.execute(f"""
        CREATE POLICY room_members_insert ON room_members
        FOR INSERT
        WITH CHECK ({OLD_CHECK})
    """)
