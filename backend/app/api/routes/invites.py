import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_authenticated_db, get_current_user
from app.models.room import Room
from app.models.room_invite import RoomInvite
from app.models.room_member import RoomMember
from app.models.user import User
from app.schemas.invite import InviteOut, InviteWithDetailsOut
from app.schemas.room import RoomMemberOut

router = APIRouter(prefix="/invites", tags=["invites"])


async def _require_pending_invite(
    db: AsyncSession, invite_id: uuid.UUID, user_id: uuid.UUID
) -> RoomInvite:
    result = await db.execute(
        select(RoomInvite).where(
            RoomInvite.id == invite_id, RoomInvite.invited_user_id == user_id
        )
    )
    invite = result.scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Invite already responded to"
        )
    return invite


@router.get("/me", response_model=list[InviteWithDetailsOut])
async def list_my_invites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_authenticated_db),
) -> list[InviteWithDetailsOut]:
    """Pending invites addressed to me -- the "who invited me" component."""
    result = await db.execute(
        select(
            RoomInvite.id,
            RoomInvite.room_id,
            Room.name.label("room_name"),
            RoomInvite.invited_by_id,
            User.username.label("invited_by_username"),
            RoomInvite.status,
            RoomInvite.created_at,
        )
        .join(Room, Room.id == RoomInvite.room_id)
        .join(User, User.id == RoomInvite.invited_by_id)
        .where(RoomInvite.invited_user_id == current_user.id, RoomInvite.status == "pending")
        .order_by(RoomInvite.created_at.desc())
    )
    return [InviteWithDetailsOut(**row._mapping) for row in result.all()]


@router.post("/{invite_id}/accept", response_model=RoomMemberOut, status_code=status.HTTP_201_CREATED)
async def accept_invite(
    invite_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_authenticated_db),
) -> RoomMember:
    invite = await _require_pending_invite(db, invite_id, current_user.id)

    # Flip the invite to accepted first, in the same transaction as the
    # room_members insert below -- room_members_insert's WITH CHECK (see
    # migration e539495125d5) looks for exactly this: an accepted invite row
    # for this room and user, which is how a self-insert into a *private*
    # room is allowed through RLS for someone who isn't a member yet.
    invite.status = "accepted"
    invite.responded_at = datetime.now(timezone.utc)
    await db.flush()

    membership = RoomMember(room_id=invite.room_id, user_id=current_user.id, role="member")
    db.add(membership)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already a member of this room",
        )

    return membership


@router.post("/{invite_id}/decline", response_model=InviteOut)
async def decline_invite(
    invite_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_authenticated_db),
) -> RoomInvite:
    invite = await _require_pending_invite(db, invite_id, current_user.id)

    invite.status = "declined"
    invite.responded_at = datetime.now(timezone.utc)
    await db.commit()

    return invite
