"""add room invites table and rls policies

Revision ID: e539495125d5
Revises: aa540383c056
Create Date: 2026-09-09 20:41:44.667153

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e539495125d5'
down_revision: Union[str, Sequence[str], None] = 'aa540383c056'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CURRENT_USER_ID = "current_setting('app.current_user_id', true)::uuid"

OLD_ROOMS_SELECT = f"""
    is_private = false
    OR owner_id = {CURRENT_USER_ID}
    OR is_room_member(id, {CURRENT_USER_ID})
"""

NEW_ROOMS_SELECT = f"""
    is_private = false
    OR owner_id = {CURRENT_USER_ID}
    OR is_room_member(id, {CURRENT_USER_ID})
    OR EXISTS (
        SELECT 1 FROM room_invites
        WHERE room_invites.room_id = rooms.id
        AND room_invites.invited_user_id = {CURRENT_USER_ID}
        AND room_invites.status = 'pending'
    )
"""

OLD_ROOM_MEMBERS_INSERT = f"""
    (
        user_id = {CURRENT_USER_ID}
        AND EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id AND rooms.is_private = false
        )
    )
    OR is_room_member(room_id, {CURRENT_USER_ID})
    OR (
        user_id = {CURRENT_USER_ID}
        AND EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id AND rooms.owner_id = {CURRENT_USER_ID}
        )
    )
"""

NEW_ROOM_MEMBERS_INSERT = f"""
    (
        user_id = {CURRENT_USER_ID}
        AND EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id AND rooms.is_private = false
        )
    )
    OR is_room_member(room_id, {CURRENT_USER_ID})
    OR (
        user_id = {CURRENT_USER_ID}
        AND EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id AND rooms.owner_id = {CURRENT_USER_ID}
        )
    )
    OR (
        user_id = {CURRENT_USER_ID}
        AND EXISTS (
            SELECT 1 FROM room_invites
            WHERE room_invites.room_id = room_members.room_id
            AND room_invites.invited_user_id = {CURRENT_USER_ID}
            AND room_invites.status = 'accepted'
        )
    )
"""


def upgrade() -> None:
    op.create_table(
        "room_invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "room_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rooms.id"),
            nullable=False,
        ),
        sa.Column(
            "invited_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "invited_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'declined')", name="room_invites_status_check"
        ),
        sa.CheckConstraint(
            "invited_user_id != invited_by_id", name="room_invites_no_self_invite_check"
        ),
    )
    op.create_index("ix_room_invites_room_id", "room_invites", ["room_id"])
    op.create_index("ix_room_invites_invited_user_id", "room_invites", ["invited_user_id"])
    # One live (pending) invite per (room, invitee) at a time -- a fresh
    # invite can be sent again once the prior one's been accepted/declined,
    # since only pending rows go into this partial index.
    op.execute(
        """
        CREATE UNIQUE INDEX ix_room_invites_one_pending_per_room_user
        ON room_invites (room_id, invited_user_id)
        WHERE status = 'pending'
        """
    )

    op.execute("GRANT SELECT, INSERT ON room_invites TO app_user")
    # Column-level grant: app_user can flip status/responded_at (accept or
    # decline) but can never repoint an invite at a different room or user
    # after the fact, no matter what a route handler's UPDATE statement says.
    op.execute("GRANT UPDATE (status, responded_at) ON room_invites TO app_user")

    op.execute("ALTER TABLE room_invites ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE room_invites FORCE ROW LEVEL SECURITY")

    # SELECT: you can see an invite if you're the invitee or the inviter.
    op.execute(f"""
        CREATE POLICY room_invites_select ON room_invites
        FOR SELECT
        USING (
            invited_user_id = {CURRENT_USER_ID}
            OR invited_by_id = {CURRENT_USER_ID}
        )
    """)
    # INSERT: only the room's owner can invite someone to it (product
    # decision for this feature -- the invite modal only ever offers rooms
    # the caller owns, this is that same rule enforced at the DB layer too).
    op.execute(f"""
        CREATE POLICY room_invites_insert ON room_invites
        FOR INSERT
        WITH CHECK (
            invited_by_id = {CURRENT_USER_ID}
            AND EXISTS (
                SELECT 1 FROM rooms
                WHERE rooms.id = room_id AND rooms.owner_id = {CURRENT_USER_ID}
            )
        )
    """)
    # UPDATE: only the invitee can respond to their own invite (accept/
    # decline). Combined with the column-level GRANT above, this is the only
    # write path into this table other than the initial INSERT.
    op.execute(f"""
        CREATE POLICY room_invites_update ON room_invites
        FOR UPDATE
        USING ( invited_user_id = {CURRENT_USER_ID} )
        WITH CHECK ( invited_user_id = {CURRENT_USER_ID} )
    """)

    # rooms_select needs a matching branch: without it, an invitee can't see
    # the room they're being invited to (e.g. its name) until after they've
    # already joined it, which is backwards. Same shape as the owner-
    # visibility fix in aa540383c056.
    op.execute("DROP POLICY rooms_select ON rooms")
    op.execute(f"""
        CREATE POLICY rooms_select ON rooms
        FOR SELECT
        USING ({NEW_ROOMS_SELECT})
    """)

    # room_members_insert needs a matching branch: accepting an invite to a
    # *private* room is a self-insert into room_members by someone who, by
    # definition, isn't a member yet -- neither existing branch (public-room
    # self-join, or "an existing member added you") covers that. This new
    # branch only fires once the invite's status has already been flipped to
    # 'accepted' (the accept endpoint does that update and this insert in
    # the same transaction).
    op.execute("DROP POLICY room_members_insert ON room_members")
    op.execute(f"""
        CREATE POLICY room_members_insert ON room_members
        FOR INSERT
        WITH CHECK ({NEW_ROOM_MEMBERS_INSERT})
    """)


def downgrade() -> None:
    op.execute("DROP POLICY room_members_insert ON room_members")
    op.execute(f"""
        CREATE POLICY room_members_insert ON room_members
        FOR INSERT
        WITH CHECK ({OLD_ROOM_MEMBERS_INSERT})
    """)

    op.execute("DROP POLICY rooms_select ON rooms")
    op.execute(f"""
        CREATE POLICY rooms_select ON rooms
        FOR SELECT
        USING ({OLD_ROOMS_SELECT})
    """)

    op.execute("DROP POLICY room_invites_update ON room_invites")
    op.execute("DROP POLICY room_invites_insert ON room_invites")
    op.execute("DROP POLICY room_invites_select ON room_invites")

    op.execute("ALTER TABLE room_invites NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE room_invites DISABLE ROW LEVEL SECURITY")

    op.execute("REVOKE ALL ON room_invites FROM app_user")

    op.drop_table("room_invites")
