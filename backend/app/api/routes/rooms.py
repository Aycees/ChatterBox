import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_authenticated_db, get_current_user
from app.models.message import Message
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.user import User
from app.schemas.message import MessageOut
from app.schemas.room import RoomCreate, RoomJoinRequest, RoomMemberOut, RoomOut

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    room_in: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_authenticated_db),
) -> Room:
    room = Room(
        id=uuid.uuid4(),
        name=room_in.name,
        is_private=room_in.is_private,
        owner_id=current_user.id,
    )
    db.add(room)
    # Flush so the rooms row exists in the transaction before the
    # room_members insert runs -- room_members_insert's WITH CHECK has to be
    # able to see it (via its "are you this room's owner" clause) to let the
    # membership row through RLS.
    await db.flush()

    db.add(RoomMember(room_id=room.id, user_id=current_user.id, role="owner"))

    # No db.refresh() here: expire_on_commit=False means `room`'s attributes
    # (including server-generated created_at/updated_at, already populated
    # via RETURNING at flush time) stay valid post-commit. A refresh would
    # also be actively wrong: it'd run in a new transaction after commit()
    # ends this one, where app.current_user_id -- set SET LOCAL, so
    # transaction-scoped -- is no longer set.
    await db.commit()
    return room


@router.get("", response_model=list[RoomOut])
async def list_my_rooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_authenticated_db),
) -> list[Room]:
    result = await db.execute(
        select(Room)
        .join(RoomMember, RoomMember.room_id == Room.id)
        .where(RoomMember.user_id == current_user.id)
        .order_by(Room.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/public", response_model=list[RoomOut])
async def list_public_rooms(
    db: AsyncSession = Depends(get_authenticated_db),
) -> list[Room]:
    result = await db.execute(
        select(Room).where(Room.is_private.is_(False)).order_by(Room.created_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/{room_id}/join", response_model=RoomMemberOut, status_code=status.HTTP_201_CREATED
)
async def join_room(
    room_id: uuid.UUID,
    join_in: RoomJoinRequest = RoomJoinRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_authenticated_db),
) -> RoomMember:
    # No user_id in the body -> self-join (only passes RLS for public rooms).
    # user_id given -> caller is an existing member/owner adding someone else,
    # which is how a private-room invite actually happens under
    # room_members_insert (see 4.4): there's no "request to join" path for
    # private rooms, only "an existing member adds you."
    target_user_id = join_in.user_id or current_user.id

    membership = RoomMember(room_id=room_id, user_id=target_user_id, role="member")
    db.add(membership)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That user is already a member of this room",
        )
    except ProgrammingError:
        # RLS rejected the INSERT (WITH CHECK failed on room_members_insert):
        # either the room is private and neither you nor the target is
        # already a member, or you're not entitled to add this user.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to add this member to the room",
        )

    # See create_room: no db.refresh() -- unnecessary given
    # expire_on_commit=False, and would break on the same transaction-scoped
    # app.current_user_id issue if it ran here.
    return membership


@router.get("/{room_id}/messages", response_model=list[MessageOut])
async def list_messages(
    room_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_authenticated_db),
) -> list[Message]:
    # Membership check up front so a non-member gets a 404 (room not found,
    # from their point of view) instead of a silently-empty page that looks
    # identical to "you're a member of an empty room." RLS still enforces
    # this independently on the messages_select policy either way (FR-8);
    # this is purely about giving the caller a sane HTTP response.
    membership = await db.execute(
        select(RoomMember).where(
            RoomMember.room_id == room_id, RoomMember.user_id == current_user.id
        )
    )
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    # Pagination: offset-based, newest-first (FR-4). `offset` is page number
    # * limit from the caller's perspective; fine at this scale, though a
    # cursor on created_at/id would hold up better under concurrent inserts.
    result = await db.execute(
        select(Message)
        .where(Message.room_id == room_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())
