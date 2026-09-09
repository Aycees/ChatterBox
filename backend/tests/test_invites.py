from sqlalchemy import select, text

from app.models.room_member import RoomMember
from conftest import add_member, auth_headers, make_invite, make_room, make_user


async def set_current_user(session, user_id):
    await session.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": str(user_id)}
    )


# ---- POST /rooms/{room_id}/invites ----


async def test_owner_can_invite_user_to_private_room(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)

    response = await client.post(
        f"/rooms/{room.id}/invites",
        json={"invited_user_id": str(invitee.id)},
        headers=auth_headers(owner),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["invited_user_id"] == str(invitee.id)
    assert body["invited_by_id"] == str(owner.id)
    assert body["status"] == "pending"


async def test_non_owner_member_cannot_invite(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    member = await make_user(admin_db_session)
    await add_member(admin_db_session, room, member, role="member")
    invitee = await make_user(admin_db_session)

    response = await client.post(
        f"/rooms/{room.id}/invites",
        json={"invited_user_id": str(invitee.id)},
        headers=auth_headers(member),
    )
    assert response.status_code == 403


async def test_cannot_invite_yourself(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")

    response = await client.post(
        f"/rooms/{room.id}/invites",
        json={"invited_user_id": str(owner.id)},
        headers=auth_headers(owner),
    )
    assert response.status_code == 400


async def test_inviting_nonexistent_user_returns_404(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")

    response = await client.post(
        f"/rooms/{room.id}/invites",
        json={"invited_user_id": "00000000-0000-0000-0000-000000000000"},
        headers=auth_headers(owner),
    )
    assert response.status_code == 404


async def test_inviting_existing_member_returns_409(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    member = await make_user(admin_db_session)
    await add_member(admin_db_session, room, member, role="member")

    response = await client.post(
        f"/rooms/{room.id}/invites",
        json={"invited_user_id": str(member.id)},
        headers=auth_headers(owner),
    )
    assert response.status_code == 409


async def test_duplicate_pending_invite_returns_409(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    await make_invite(admin_db_session, room, invited_user=invitee, invited_by=owner)

    response = await client.post(
        f"/rooms/{room.id}/invites",
        json={"invited_user_id": str(invitee.id)},
        headers=auth_headers(owner),
    )
    assert response.status_code == 409


# ---- GET /invites/me ----


async def test_list_my_invites_returns_pending_with_room_and_inviter_details(
    client, admin_db_session
):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True, name="Secret Club")
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    await make_invite(admin_db_session, room, invited_user=invitee, invited_by=owner)

    response = await client.get("/invites/me", headers=auth_headers(invitee))
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["room_name"] == "Secret Club"
    assert body[0]["invited_by_username"] == owner.username
    assert body[0]["status"] == "pending"


async def test_list_my_invites_excludes_other_users_invites(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    await make_invite(admin_db_session, room, invited_user=invitee, invited_by=owner)

    bystander = await make_user(admin_db_session)
    response = await client.get("/invites/me", headers=auth_headers(bystander))
    assert response.status_code == 200
    assert response.json() == []


async def test_list_my_invites_excludes_already_responded_invites(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    await make_invite(
        admin_db_session, room, invited_user=invitee, invited_by=owner, status="accepted"
    )

    response = await client.get("/invites/me", headers=auth_headers(invitee))
    assert response.status_code == 200
    assert response.json() == []


# ---- POST /invites/{invite_id}/accept ----


async def test_accept_invite_to_private_room_adds_membership(client, admin_db_session):
    # This is the landmine case: accepting means the invitee inserts
    # themself into room_members for a *private* room they don't belong to
    # yet, which room_members_insert only allows via the accepted-invite
    # branch added in migration e539495125d5.
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    invite = await make_invite(admin_db_session, room, invited_user=invitee, invited_by=owner)

    response = await client.post(f"/invites/{invite.id}/accept", headers=auth_headers(invitee))
    assert response.status_code == 201
    assert response.json()["user_id"] == str(invitee.id)

    result = await admin_db_session.execute(
        select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == invitee.id)
    )
    assert result.scalar_one_or_none() is not None


async def test_accept_someone_elses_invite_returns_404(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    invite = await make_invite(admin_db_session, room, invited_user=invitee, invited_by=owner)

    intruder = await make_user(admin_db_session)
    response = await client.post(f"/invites/{invite.id}/accept", headers=auth_headers(intruder))
    assert response.status_code == 404


async def test_accept_already_responded_invite_returns_409(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    invite = await make_invite(
        admin_db_session, room, invited_user=invitee, invited_by=owner, status="declined"
    )

    response = await client.post(f"/invites/{invite.id}/accept", headers=auth_headers(invitee))
    assert response.status_code == 409


# ---- POST /invites/{invite_id}/decline ----


async def test_decline_invite_does_not_add_membership(client, admin_db_session):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    invite = await make_invite(admin_db_session, room, invited_user=invitee, invited_by=owner)

    response = await client.post(f"/invites/{invite.id}/decline", headers=auth_headers(invitee))
    assert response.status_code == 200
    assert response.json()["status"] == "declined"

    result = await admin_db_session.execute(
        select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == invitee.id)
    )
    assert result.scalar_one_or_none() is None


# ---- RLS: proof Postgres enforces this independent of application code ----


async def test_app_user_direct_select_on_room_invites_hidden_from_bystander(
    db_session, admin_db_session
):
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    invite = await make_invite(admin_db_session, room, invited_user=invitee, invited_by=owner)

    bystander = await make_user(admin_db_session)
    await set_current_user(db_session, bystander.id)

    result = await db_session.execute(
        text("SELECT id FROM room_invites WHERE id = :id"), {"id": str(invite.id)}
    )
    assert result.first() is None


async def test_invitee_can_see_private_room_name_while_invite_pending(
    db_session, admin_db_session
):
    # rooms_select needed a matching branch (migration e539495125d5) for
    # this: without it, the invitee can't see the private room's own row,
    # even though they've been invited to it.
    owner = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=True)
    await add_member(admin_db_session, room, owner, role="owner")
    invitee = await make_user(admin_db_session)
    await make_invite(admin_db_session, room, invited_user=invitee, invited_by=owner)

    await set_current_user(db_session, invitee.id)
    result = await db_session.execute(
        text("SELECT id FROM rooms WHERE id = :room_id"), {"room_id": str(room.id)}
    )
    assert result.first() is not None
