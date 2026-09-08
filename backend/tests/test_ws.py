import pytest_asyncio
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.db.session import engine
from app.main import app
from conftest import add_member, auth_headers, make_room, make_user

# Starlette's TestClient bridges the sync test functions below to the async
# ASGI app via its own background thread + event loop (a "portal"), separate
# from pytest-asyncio's session-scoped loop the other test files' httpx.
# AsyncClient calls share (pytest.ini: asyncio_default_test_loop_scope =
# session). app.db.session.engine is a single pooled connection factory
# used by the whole app; if a connection it opened under one loop is still
# checked into the pool when a *different* loop tries to reuse it, asyncpg
# raises "Future attached to a different loop". Disposing the pool before
# and after this module's tests run means every connection touched from
# inside a `with TestClient(app) as client:` block is created fresh, under
# the portal's own loop, and nothing stale carries over to the async tests
# in other files.


@pytest_asyncio.fixture(autouse=True)
async def _isolate_engine_pool_for_sync_client():
    await engine.dispose()
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client(_isolate_engine_pool_for_sync_client):
    with TestClient(app) as c:
        yield c


async def member_and_room(admin_db_session, *, private=False):
    owner = await make_user(admin_db_session)
    other = await make_user(admin_db_session)
    room = await make_room(admin_db_session, owner=owner, is_private=private)
    await add_member(admin_db_session, room, owner, role="owner")
    await add_member(admin_db_session, room, other, role="member")
    return owner, other, room


# ---- auth-before-accept (spec 5.2) ----


async def test_connect_without_ticket_is_rejected_before_accept(
    client, admin_db_session
):
    owner, _other, room = await member_and_room(admin_db_session)

    try:
        with client.websocket_connect(f"/ws/rooms/{room.id}") as ws:
            ws.receive_text()
            assert False, "connection should have been closed, not accepted"
    except WebSocketDisconnect as exc:
        assert exc.code == 1008


async def test_ws_ticket_request_from_non_member_returns_404(client, admin_db_session):
    outsider = await make_user(admin_db_session)
    _owner, _other, room = await member_and_room(admin_db_session)

    response = client.post(
        f"/rooms/{room.id}/ws-ticket", headers=auth_headers(outsider)
    )

    assert response.status_code == 404


async def test_ticket_minted_for_another_room_is_rejected(client, admin_db_session):
    owner, _other, room = await member_and_room(admin_db_session)
    other_room = await make_room(admin_db_session, owner=owner)
    await add_member(admin_db_session, other_room, owner, role="owner")

    ticket = client.post(
        f"/rooms/{other_room.id}/ws-ticket", headers=auth_headers(owner)
    ).json()["ticket"]

    try:
        with client.websocket_connect(f"/ws/rooms/{room.id}?ticket={ticket}") as ws:
            ws.receive_text()
            assert False, "a ticket minted for a different room must not work here"
    except WebSocketDisconnect as exc:
        assert exc.code == 1008


async def test_ticket_cannot_be_reused(client, admin_db_session):
    owner, _other, room = await member_and_room(admin_db_session)
    ticket = client.post(
        f"/rooms/{room.id}/ws-ticket", headers=auth_headers(owner)
    ).json()["ticket"]

    with client.websocket_connect(f"/ws/rooms/{room.id}?ticket={ticket}") as ws:
        ws.receive_json()  # own "online" presence broadcast

    try:
        with client.websocket_connect(f"/ws/rooms/{room.id}?ticket={ticket}") as ws:
            ws.receive_text()
            assert False, "a consumed ticket must not work a second time"
    except WebSocketDisconnect as exc:
        assert exc.code == 1008


# ---- the real-time core itself (FR-5, FR-6, FR-7) ----


async def test_message_round_trip_is_broadcast_and_persisted(client, admin_db_session):
    owner, other, room = await member_and_room(admin_db_session)
    owner_ticket = client.post(
        f"/rooms/{room.id}/ws-ticket", headers=auth_headers(owner)
    ).json()["ticket"]

    with client.websocket_connect(
        f"/ws/rooms/{room.id}?ticket={owner_ticket}"
    ) as ws_owner:
        assert (
            ws_owner.receive_json()["payload"]["status"] == "online"
        )  # owner's own presence

        other_ticket = client.post(
            f"/rooms/{room.id}/ws-ticket", headers=auth_headers(other)
        ).json()["ticket"]
        with client.websocket_connect(
            f"/ws/rooms/{room.id}?ticket={other_ticket}"
        ) as ws_other:
            join_event = ws_owner.receive_json()
            assert join_event == {
                "type": "presence",
                "payload": {"user_id": str(other.id), "status": "online"},
            }
            assert (
                ws_other.receive_json()["payload"]["status"] == "online"
            )  # other's own presence

            ws_owner.send_json({"type": "message", "payload": {"content": "hey team"}})

            echoed_to_sender = ws_owner.receive_json()
            received_by_other = ws_other.receive_json()

            for envelope in (echoed_to_sender, received_by_other):
                assert envelope["type"] == "message"
                assert envelope["payload"]["content"] == "hey team"
                assert envelope["payload"]["sender_id"] == str(owner.id)
                assert envelope["payload"]["room_id"] == str(room.id)
            assert (
                echoed_to_sender["payload"]["id"] == received_by_other["payload"]["id"]
            )

        # ws_other's `with` block exited -> disconnect -> "offline" presence
        leave_event = ws_owner.receive_json()
        assert leave_event == {
            "type": "presence",
            "payload": {"user_id": str(other.id), "status": "offline"},
        }

    history = client.get(f"/rooms/{room.id}/messages", headers=auth_headers(owner))
    contents = [m["content"] for m in history.json()]
    assert "hey team" in contents


async def test_typing_is_relayed_but_not_echoed_to_sender(client, admin_db_session):
    owner, other, room = await member_and_room(admin_db_session)
    owner_ticket = client.post(
        f"/rooms/{room.id}/ws-ticket", headers=auth_headers(owner)
    ).json()["ticket"]

    with client.websocket_connect(
        f"/ws/rooms/{room.id}?ticket={owner_ticket}"
    ) as ws_owner:
        ws_owner.receive_json()  # own presence

        other_ticket = client.post(
            f"/rooms/{room.id}/ws-ticket", headers=auth_headers(other)
        ).json()["ticket"]
        with client.websocket_connect(
            f"/ws/rooms/{room.id}?ticket={other_ticket}"
        ) as ws_other:
            ws_owner.receive_json()  # other's join presence
            ws_other.receive_json()  # other's own presence

            ws_other.send_json({"type": "typing", "payload": {}})

            typing_event = ws_owner.receive_json()
            assert typing_event == {
                "type": "typing",
                "payload": {"user_id": str(other.id)},
            }

            # prove the typist never got their own event echoed: broadcast
            # explicitly excludes the sender, so nothing was ever queued on
            # ws_other for the typing event above. If it *had* been echoed,
            # it would be sitting ahead of this message in ws_other's queue.
            ws_owner.send_json(
                {"type": "message", "payload": {"content": "confirming"}}
            )
            next_on_other = ws_other.receive_json()
            assert next_on_other["type"] == "message"
            assert next_on_other["payload"]["content"] == "confirming"


async def test_unknown_event_type_returns_error_without_closing(
    client, admin_db_session
):
    owner, _other, room = await member_and_room(admin_db_session)
    ticket = client.post(
        f"/rooms/{room.id}/ws-ticket", headers=auth_headers(owner)
    ).json()["ticket"]

    with client.websocket_connect(f"/ws/rooms/{room.id}?ticket={ticket}") as ws:
        ws.receive_json()  # own presence

        ws.send_json({"type": "not-a-real-type", "payload": {}})
        error_envelope = ws.receive_json()
        assert error_envelope["type"] == "error"

        # connection is still open and usable afterward
        ws.send_json({"type": "typing", "payload": {}})


async def test_message_over_length_limit_returns_error_without_closing(
    client, admin_db_session
):
    owner, _other, room = await member_and_room(admin_db_session)
    ticket = client.post(
        f"/rooms/{room.id}/ws-ticket", headers=auth_headers(owner)
    ).json()["ticket"]

    with client.websocket_connect(f"/ws/rooms/{room.id}?ticket={ticket}") as ws:
        ws.receive_json()  # own presence

        ws.send_json({"type": "message", "payload": {"content": "x" * 4001}})
        error_envelope = ws.receive_json()
        assert error_envelope["type"] == "error"

        # connection survives the rejected message and a normal one still works
        ws.send_json({"type": "message", "payload": {"content": "short enough"}})
        message_envelope = ws.receive_json()
        assert message_envelope["type"] == "message"
        assert message_envelope["payload"]["content"] == "short enough"
