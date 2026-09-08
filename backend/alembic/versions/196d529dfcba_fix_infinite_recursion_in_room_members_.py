"""fix infinite recursion in room_members and rooms rls policies

Revision ID: 196d529dfcba
Revises: f42e2529deee
Create Date: 2026-09-04 16:32:32.541915

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '196d529dfcba'
down_revision: Union[str, Sequence[str], None] = 'f42e2529deee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CURRENT_USER_ID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # room_members_select's own USING clause reads room_members from
    # within its own policy (the "rooms I belong to" branch). Under FORCE
    # ROW LEVEL SECURITY, any read of room_members -- including that
    # subquery -- is itself filtered by room_members_select, so evaluating
    # the policy re-triggers the same policy: Postgres raises "infinite
    # recursion detected in policy for relation room_members". The same
    # subquery shape shows up in rooms_select, room_members_insert, and
    # messages_select/insert, and Postgres does not reliably short-circuit
    # around it even when an earlier OR branch already matches (confirmed
    # empirically: it recurred on a plain public-room insert, which should
    # never have touched the membership branch at all).
    #
    # Fix: a SECURITY DEFINER helper function. It runs with the privileges
    # of whichever role created it -- the migration/owner role, which
    # bypasses RLS entirely -- so its internal read of room_members never
    # re-invokes room_members_select, breaking the cycle.
    op.execute("""
        CREATE FUNCTION is_room_member(p_room_id uuid, p_user_id uuid)
        RETURNS boolean
        LANGUAGE sql
        SECURITY DEFINER
        STABLE
        SET search_path = public
        AS $$
            SELECT EXISTS (
                SELECT 1 FROM room_members
                WHERE room_id = p_room_id AND user_id = p_user_id
            )
        $$
    """)
    op.execute("GRANT EXECUTE ON FUNCTION is_room_member(uuid, uuid) TO app_user")

    op.execute("DROP POLICY room_members_select ON room_members")
    op.execute(f"""
        CREATE POLICY room_members_select ON room_members
        FOR SELECT
        USING (
            user_id = {CURRENT_USER_ID}
            OR is_room_member(room_id, {CURRENT_USER_ID})
        )
    """)

    op.execute("DROP POLICY rooms_select ON rooms")
    op.execute(f"""
        CREATE POLICY rooms_select ON rooms
        FOR SELECT
        USING (
            is_private = false
            OR is_room_member(id, {CURRENT_USER_ID})
        )
    """)

    op.execute("DROP POLICY room_members_insert ON room_members")
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
            OR is_room_member(room_id, {CURRENT_USER_ID})
            OR (
                user_id = {CURRENT_USER_ID}
                AND EXISTS (
                    SELECT 1 FROM rooms
                    WHERE rooms.id = room_id AND rooms.owner_id = {CURRENT_USER_ID}
                )
            )
        )
    """)

    op.execute("DROP POLICY messages_select ON messages")
    op.execute(f"""
        CREATE POLICY messages_select ON messages
        FOR SELECT
        USING ( is_room_member(room_id, {CURRENT_USER_ID}) )
    """)

    op.execute("DROP POLICY messages_insert ON messages")
    op.execute(f"""
        CREATE POLICY messages_insert ON messages
        FOR INSERT
        WITH CHECK (
            sender_id = {CURRENT_USER_ID}
            AND is_room_member(room_id, {CURRENT_USER_ID})
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY messages_insert ON messages")
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

    op.execute("DROP POLICY messages_select ON messages")
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

    op.execute("DROP POLICY room_members_insert ON room_members")
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
        )
    """)

    op.execute("DROP POLICY rooms_select ON rooms")
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

    op.execute("DROP POLICY room_members_select ON room_members")
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

    op.execute("REVOKE EXECUTE ON FUNCTION is_room_member(uuid, uuid) FROM app_user")
    op.execute("DROP FUNCTION is_room_member(uuid, uuid)")
