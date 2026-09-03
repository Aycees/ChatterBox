"""enable rls and create policies

Revision ID: 9ab66ac6d14a
Revises: 55a110390756
Create Date: 2026-09-04 01:41:44.635552

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "9ab66ac6d14a"
down_revision: Union[str, Sequence[str], None] = "55a110390756"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CURRENT_USER_ID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    for table in ("rooms", "room_members", "messages"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    # ---- rooms ----
    # SELECT: public rooms, or rooms you're a member of.
    op.execute(f"""
        CREATE POLICY rooms_select ON rooms
        FOR SELECT
        USING (
            is_private = false
            OR EXISTS (
                SELECT 1 FROM room_members
                WHERE room_members.room_id = rooms.id
                AND room_members.user_id = {CURRENT_USER_ID}
            )
        )
    """)
    # INSERT: without this, FORCE RLS blocks every insert, since a table with
    # RLS forced and no policy for a given command denies that command
    # entirely. Room creation (FR-2) requires the creator to be the owner,
    # so that's what's enforced here.
    op.execute(f"""
        CREATE POLICY rooms_insert ON rooms
        FOR INSERT
        WITH CHECK ( owner_id = {CURRENT_USER_ID} )
    """)
    # UPDATE/DELETE: owner only (4.4).
    op.execute(f"""
        CREATE POLICY rooms_update ON rooms
        FOR UPDATE
        USING ( owner_id = {CURRENT_USER_ID} )
        WITH CHECK ( owner_id = {CURRENT_USER_ID} )
    """)
    op.execute(f"""
        CREATE POLICY rooms_delete ON rooms
        FOR DELETE
        USING ( owner_id = {CURRENT_USER_ID} )
    """)

    # ---- room_members ----
    # SELECT: your own membership rows, plus every membership row for a room
    # you belong to (so you can see the member list of your own rooms).
    op.execute(f"""
        CREATE POLICY room_members_select ON room_members
        FOR SELECT
        USING (
            user_id = {CURRENT_USER_ID}
            OR room_id IN (
                SELECT room_id FROM room_members AS my_memberships
                WHERE my_memberships.user_id = {CURRENT_USER_ID}
            )
        )
    """)
    # INSERT: two distinct ways a row can be created, per 4.4 --
    #   1) you add yourself to a public room (self-join)
    #   2) an existing member/owner of a room adds someone else
    #      (covers private-room invites, and works for public rooms too)
    op.execute(f"""
        CREATE POLICY room_members_insert ON room_members
        FOR INSERT
        WITH CHECK (
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
        )
    """)

    # ---- messages ----
    # SELECT/INSERT: only for a room you're currently a member of.
    op.execute(f"""
        CREATE POLICY messages_select ON messages
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM room_members
                WHERE room_members.room_id = messages.room_id
                AND room_members.user_id = {CURRENT_USER_ID}
            )
        )
    """)
    # INSERT: must be a member of the room, and sender_id must be yourself.
    op.execute(f"""
        CREATE POLICY messages_insert ON messages
        FOR INSERT
        WITH CHECK (
            sender_id = {CURRENT_USER_ID}
            AND EXISTS (
                SELECT 1 FROM room_members
                WHERE room_members.room_id = messages.room_id
                AND room_members.user_id = {CURRENT_USER_ID}
            )
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY messages_insert ON messages")
    op.execute("DROP POLICY messages_select ON messages")
    op.execute("DROP POLICY room_members_insert ON room_members")
    op.execute("DROP POLICY room_members_select ON room_members")
    op.execute("DROP POLICY rooms_delete ON rooms")
    op.execute("DROP POLICY rooms_update ON rooms")
    op.execute("DROP POLICY rooms_insert ON rooms")
    op.execute("DROP POLICY rooms_select ON rooms")

    for table in ("rooms", "room_members", "messages"):
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
