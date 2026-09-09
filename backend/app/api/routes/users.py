from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(
    search: str | None = Query(None, min_length=1, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    """The user directory (not RLS-protected, `users` has no policies -- see
    4.4). Excludes the caller: they can't invite themself to a room.
    """
    query = select(User).where(User.id != current_user.id)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(User.username.ilike(pattern), User.email.ilike(pattern)))
    query = query.order_by(User.username).limit(limit)

    result = await db.execute(query)
    return list(result.scalars().all())
