import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.core.security import create_access_token, hash_password
from app.models.message import Message
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.user import User

# ---- setup helpers (write directly via the admin/owner session, bypassing
# both RLS and the API, so each test only exercises the one thing it's
# actually testing) ----


async def make_user(admin_db_session, **overrides):
    unique = uuid.uuid4().hex[:8]
    defaults = {
        "id": uuid.uuid4(),
        "username": f"user-{unique}",
        "email": f"{unique}@example.com",
        "password_hash": hash_password("irrelevant"),
    }
    user = User(**{**defaults, **overrides})
    admin_db_session.add(user)
    await admin_db_session.commit()
    await admin_db_session.refresh(user)
    return user


def auth_headers(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


async def make_room(admin_db_session, owner, is_private=False, name="Room"):
    room = Room(id=uuid.uuid4(), name=name, is_private=is_private, owner_id=owner.id)
    admin_db_session.add(room)
    await admin_db_session.commit()
    await admin_db_session.refresh(room)
    return room


async def add_member(admin_db_session, room, user, role="member"):
    membership = RoomMember(room_id=room.id, user_id=user.id, role=role)
    admin_db_session.add(membership)
    await admin_db_session.commit()
    return membership


async def make_message(admin_db_session, room, sender, content="hello", created_at=None):
    message = Message(id=uuid.uuid4(), room_id=room.id, sender_id=sender.id, content=content)
    if created_at is not None:
        message.created_at = created_at
    admin_db_session.add(message)
    await admin_db_session.commit()
    await admin_db_session.refresh(message)
    return message


async def set_current_user(session, user_id):
    await session.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": str(user_id)}
    )


# ---- POST /rooms ----


async def test_create_room_adds_creator_as_owner(client, admin_db_session):
    owner = await make_user(admin_db_session)

    response = await client.post(
        "/rooms", json={"name": "General", "is_private": False}, headers=auth_headers(owner)
    )
    assert response.status_code == 201
    body = response.json()
    assert body["owner_id"] == str(owner.id)

    result = await admin_db_session.execute(
        select(RoomMember).where(RoomMember.room_id == uuid.UUID(body["id"]))
    )
    membership = result.scalar_one()
    assert membership.user_id == owner.id
    assert membership.role == "owner"


async def test_create_private_room_adds_creator_as_owner(client, admin_db_session):
    # Regression test: unlike a public room, a private room's rooms_select
    # can't short-circuit past is_room_member()/current_setting() on the
    # post-commit read, so this is the scenario that would have caught the
    # transaction-scoped app.current_user_id bug fixed alongside the
    # infinite-recursion policy fix.
    owner = await make_user(admin_db_session)

    response = await client.post(
        "/rooms", json={"name": "Secret", "is_private": True}, headers=auth_headers(owner)
    )
    assert response.status_code == 201
    body = response.json()
    assert body["owner_id"] == str(owner.id)
    assert body["is_private"] is True


async def test_create_room_requires_auth(client):
    response = await client.post("/rooms", json={"name": "General"})
    assert response.status_code == 401


# ---- GET /rooms ----


async def test_list_my_rooms_excludes_rooms_i_dont_belong_to(client, admin_db_session):
    me = await make_user(admin_db_session)
    my_room = await make_room(admin_db_session, owner=me)
    await add_member(admin_db_session, my_room, me, role="owner")

    other = await make_user(admin_db_session)
    other_public_room = await make_room(admin_db_session, owner=other, is_private=False)
    await add_member(admin_db_session, other_public_room, other, role="owner")

    response = await client.get("/rooms", headers=auth_headers(me))
    assert response.status_code == 200
    assert {r["id"] for r in response.json()} == {str(my_room.id)}


# ---- GET /rooms/public ----


async def test_list_public_rooms_excludes_private(client, admin_db_session):
    owner = await make_user(admin_db_session)
    public_room = await make_room(admin_db_session, owner=owner, is_private=False)
    private_room = await make_room(admin_db_session, owner=owner, is_private=True)

    response = await client.get("/rooms/public", headers=auth_headers(owner))
    ids = {r["id"] for r in response.json()}
    assert str(public_room.id) in ids
    assert str(private_room.id) not in ids


# ---- POST /rooms/{room_id}/join ----


async def test_join_public_room_self_join_succeeds(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=False)
    await add_member(admin_db_session, room, owner, role="owner")

    joiner = await make_user(admin_db_session)
    response = await client.post(f"/rooms/{room.id}/join", headers=auth_headers(joiner))
    assert response.status_code == 201
    assert response.json()["user_id"] == str(joiner.id)


async def test_join_private_room_self_join_returns_403(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")

    outsider = await make_user(admin_db_session)
    response = await client.post(f"/rooms/{room.id}/join", headers=auth_headers(outsider))
    assert response.status_code == 403


async def test_join_duplicate_membership_returns_409(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=False)
    await add_member(admin_db_session, room, owner, role="owner")

    response = await client.post(f"/rooms/{room.id}/join", headers=auth_headers(owner))
    assert response.status_code == 409


async def test_existing_member_can_add_another_user_to_private_room(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")

    invitee = await make_user(admin_db_session)
    response = await client.post(
        f"/rooms/{room.id}/join",
        json={"user_id": str(invitee.id)},
        headers=auth_headers(owner),
    )
    assert response.status_code == 201
    assert response.json()["user_id"] == str(invitee.id)


async def test_non_member_cannot_add_another_user_to_room(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")

    outsider = await make_user(admin_db_session)
    target = await make_user(admin_db_session)
    response = await client.post(
        f"/rooms/{room.id}/join",
        json={"user_id": str(target.id)},
        headers=auth_headers(outsider),
    )
    assert response.status_code == 403


# ---- GET /rooms/{room_id}/messages ----


async def test_list_messages_non_member_returns_404(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")

    outsider = await make_user(admin_db_session)
    response = await client.get(f"/rooms/{room.id}/messages", headers=auth_headers(outsider))
    assert response.status_code == 404


async def test_list_messages_member_returns_newest_first(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=False)
    await add_member(admin_db_session, room, owner, role="owner")

    base = datetime.now(timezone.utc)
    await make_message(admin_db_session, room, owner, "first", created_at=base - timedelta(seconds=2))
    await make_message(admin_db_session, room, owner, "second", created_at=base - timedelta(seconds=1))

    response = await client.get(f"/rooms/{room.id}/messages", headers=auth_headers(owner))
    assert response.status_code == 200
    assert [m["content"] for m in response.json()] == ["second", "first"]


async def test_list_messages_respects_limit(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=False)
    await add_member(admin_db_session, room, owner, role="owner")

    base = datetime.now(timezone.utc)
    for i in range(5):
        await make_message(
            admin_db_session, room, owner, f"msg-{i}", created_at=base - timedelta(seconds=i)
        )

    response = await client.get(f"/rooms/{room.id}/messages?limit=2", headers=auth_headers(owner))
    assert response.status_code == 200
    assert len(response.json()) == 2


# ---- RLS: proof Postgres enforces this independent of application code
# (acceptance criteria, section 7) ----


async def test_app_user_direct_select_on_rooms_returns_zero_rows_for_non_member(
    db_session, admin_db_session
):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")

    outsider = await make_user(admin_db_session)
    await set_current_user(db_session, outsider.id)

    result = await db_session.execute(
        text("SELECT id FROM rooms WHERE id = :room_id"), {"room_id": str(room.id)}
    )
    assert result.first() is None


async def test_app_user_direct_select_on_messages_returns_zero_rows_for_non_member(
    db_session, admin_db_session
):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    await make_message(admin_db_session, room, owner, "secret")

    outsider = await make_user(admin_db_session)
    await set_current_user(db_session, outsider.id)

    result = await db_session.execute(
        text("SELECT id FROM messages WHERE room_id = :room_id"), {"room_id": str(room.id)}
    )
    assert result.first() is None


async def test_admin_connection_sees_rows_app_user_cannot(db_session, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")

    outsider = await make_user(admin_db_session)
    await set_current_user(db_session, outsider.id)

    as_app_user = await db_session.execute(
        text("SELECT id FROM rooms WHERE id = :room_id"), {"room_id": str(room.id)}
    )
    assert as_app_user.first() is None

    as_admin = await admin_db_session.execute(
        text("SELECT id FROM rooms WHERE id = :room_id"), {"room_id": str(room.id)}
    )
    assert as_admin.first() is not None


async def test_room_members_insert_rejects_cross_room_injection(db_session, admin_db_session):
    """Regression test for the room_id ambiguity bug fixed in f42e2529deee.

    The buggy WITH CHECK had an unqualified `room_id` inside a subquery
    whose own FROM clause also had a `room_id` column, so Postgres resolved
    it to the inner column and the clause degenerated to always-true. That
    let a member of one room insert a membership row into a room they had
    nothing to do with. This proves the fixed policy rejects it.
    """
    owner_x = await make_user(admin_db_session)
    room_x = await make_room(admin_db_session, owner=owner_x, is_private=False)
    await add_member(admin_db_session, room_x, owner_x, role="owner")
    member_of_x = await make_user(admin_db_session)
    await add_member(admin_db_session, room_x, member_of_x, role="member")

    owner_y = await make_user(admin_db_session)
    room_y = await make_room(admin_db_session, owner=owner_y, is_private=True)
    await add_member(admin_db_session, room_y, owner_y, role="owner")

    victim = await make_user(admin_db_session)

    await set_current_user(db_session, member_of_x.id)
    with pytest.raises(DBAPIError):
        await db_session.execute(
            text(
                "INSERT INTO room_members (room_id, user_id, role) "
                "VALUES (:room_id, :user_id, 'member')"
            ),
            {"room_id": str(room_y.id), "user_id": str(victim.id)},
        )
    await db_session.rollback()


async def test_messages_insert_rejects_forged_sender_id(db_session, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=False)
    await add_member(admin_db_session, room, owner, role="owner")
    impersonator = await make_user(admin_db_session)
    await add_member(admin_db_session, room, impersonator, role="member")

    await set_current_user(db_session, impersonator.id)
    with pytest.raises(DBAPIError):
        await db_session.execute(
            text(
                "INSERT INTO messages (id, room_id, sender_id, content) "
                "VALUES (:id, :room_id, :sender_id, 'hi')"
            ),
            {"id": str(uuid.uuid4()), "room_id": str(room.id), "sender_id": str(owner.id)},
        )
    await db_session.rollback()
