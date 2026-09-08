"""create app_user role and grants

Revision ID: 55a110390756
Revises: f470c35c9cf6
Create Date: 2026-09-04 01:24:42.985509

"""

from typing import Sequence, Union

from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "55a110390756"
down_revision: Union[str, Sequence[str], None] = "f470c35c9cf6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    password = settings.app_user_password
    # DDL statements (CREATE ROLE, ALTER ROLE, ...) don't support bind
    # parameters in Postgres's wire protocol -- there's no placeholder syntax
    # for them, so asyncpg's prepared-statement machinery can't send one.
    # The value has to be a literal in the SQL text. Escaping single quotes
    # by doubling them is standard SQL string-literal escaping.
    escaped_password = password.replace("'", "''")
    op.execute(f"CREATE ROLE app_user WITH LOGIN PASSWORD '{escaped_password}'")
    op.execute("GRANT USAGE ON SCHEMA public TO app_user")

    op.execute("GRANT SELECT, INSERT ON users TO app_user")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON rooms TO app_user")
    op.execute("GRANT SELECT, INSERT ON room_members TO app_user")
    op.execute("GRANT SELECT, INSERT ON messages TO app_user")


def downgrade() -> None:
    op.execute("REVOKE ALL ON messages, room_members, rooms, users FROM app_user")
    op.execute("REVOKE USAGE ON SCHEMA public FROM app_user")
    op.execute("DROP ROLE app_user")
