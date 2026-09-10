from conftest import auth_headers, make_user

# ---- GET /users ----


async def test_list_users_requires_auth(client):
    response = await client.get("/users")
    assert response.status_code == 401


async def test_list_users_excludes_caller(client, admin_db_session):
    me = await make_user(admin_db_session)
    other = await make_user(admin_db_session)

    response = await client.get("/users", headers=auth_headers(me))
    assert response.status_code == 200
    ids = {u["id"] for u in response.json()}
    assert str(other.id) in ids
    assert str(me.id) not in ids


async def test_list_users_never_returns_password_hash(client, admin_db_session):
    me = await make_user(admin_db_session)
    await make_user(admin_db_session)

    response = await client.get("/users", headers=auth_headers(me))
    for user in response.json():
        assert "password" not in user
        assert "password_hash" not in user


async def test_list_users_never_returns_email(client, admin_db_session):
    # The directory is visible to every authenticated user, not just people
    # who already know each other's address -- unlike /auth/me, this is
    # about a *different* user's data being fetchable by anyone logged in,
    # so email (PII) is deliberately left out of UserDirectoryOut even
    # though search still filters on it server-side.
    me = await make_user(admin_db_session)
    other = await make_user(admin_db_session, email="findme@example.com")

    response = await client.get("/users", headers=auth_headers(me))
    assert response.status_code == 200
    for user in response.json():
        assert "email" not in user

    # Confirm the field really is being filtered out, not just absent by
    # coincidence -- search by email still has to work server-side.
    search_response = await client.get("/users?search=findme", headers=auth_headers(me))
    ids = {u["id"] for u in search_response.json()}
    assert ids == {str(other.id)}
    assert "email" not in search_response.json()[0]


async def test_search_users_by_username(client, admin_db_session):
    me = await make_user(admin_db_session)
    match = await make_user(admin_db_session, username="zebra-hunter")
    await make_user(admin_db_session, username="unrelated")

    response = await client.get("/users?search=zebra", headers=auth_headers(me))
    assert response.status_code == 200
    ids = {u["id"] for u in response.json()}
    assert ids == {str(match.id)}


async def test_search_users_by_email(client, admin_db_session):
    me = await make_user(admin_db_session)
    match = await make_user(admin_db_session, email="findme@example.com")
    await make_user(admin_db_session, email="other@example.com")

    response = await client.get("/users?search=findme", headers=auth_headers(me))
    assert response.status_code == 200
    ids = {u["id"] for u in response.json()}
    assert ids == {str(match.id)}
