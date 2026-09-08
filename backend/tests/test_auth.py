from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.core.config import settings
from app.models.user import User

VALID_USER = {
    "username": "testuser",
    "email": "testuser@example.com",
    "password": "supersecret123",
}


async def register_user(client, **overrides):
    payload = {**VALID_USER, **overrides}
    return await client.post("/auth/register", json=payload)


async def get_user_from_db(db_session, email=VALID_USER["email"]):
    result = await db_session.execute(select(User).where(User.email == email))
    return result.scalar_one()


# ---- POST /auth/register ----


async def test_register_valid_returns_201_and_no_password_fields(client):
    response = await register_user(client)
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == VALID_USER["username"]
    assert body["email"] == VALID_USER["email"]
    assert "id" in body
    assert "created_at" in body
    assert "password" not in body
    assert "password_hash" not in body


async def test_register_duplicate_email_returns_409(client):
    await register_user(client)
    response = await register_user(client, username="anotheruser")
    assert response.status_code == 409


async def test_register_duplicate_username_returns_409(client):
    await register_user(client)
    response = await register_user(client, email="another@example.com")
    assert response.status_code == 409


async def test_register_invalid_email_returns_422(client):
    response = await register_user(client, email="not-an-email")
    assert response.status_code == 422


async def test_register_password_too_short_returns_422(client):
    response = await register_user(client, password="short")
    assert response.status_code == 422


async def test_register_password_too_long_returns_422(client):
    response = await register_user(client, password="x" * 100)
    assert response.status_code == 422


async def test_register_missing_field_returns_422(client):
    payload = {"email": VALID_USER["email"], "password": VALID_USER["password"]}
    response = await client.post("/auth/register", json=payload)
    assert response.status_code == 422


async def test_register_stores_bcrypt_hash_not_plaintext(client, db_session):
    await register_user(client)
    user = await get_user_from_db(db_session)
    assert user.password_hash != VALID_USER["password"]
    assert user.password_hash.startswith("$2b$")


# ---- POST /auth/login ----


async def test_login_valid_returns_token(client):
    await register_user(client)
    response = await client.post(
        "/auth/login",
        json={"email": VALID_USER["email"], "password": VALID_USER["password"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


async def test_login_wrong_password_returns_401(client):
    await register_user(client)
    response = await client.post(
        "/auth/login",
        json={"email": VALID_USER["email"], "password": "wrongpassword"},
    )
    assert response.status_code == 401


async def test_login_nonexistent_email_returns_same_401_as_wrong_password(client):
    await register_user(client)
    wrong_password_response = await client.post(
        "/auth/login",
        json={"email": VALID_USER["email"], "password": "wrongpassword"},
    )
    nonexistent_response = await client.post(
        "/auth/login",
        json={"email": "ghost@example.com", "password": "whatever123"},
    )
    assert nonexistent_response.status_code == 401
    assert nonexistent_response.json() == wrong_password_response.json()


async def test_login_malformed_email_returns_422(client):
    response = await client.post(
        "/auth/login",
        json={"email": "not-an-email", "password": "whatever123"},
    )
    assert response.status_code == 422


# ---- GET /auth/me ----


async def test_me_valid_token_returns_user(client):
    await register_user(client)
    login_response = await client.post(
        "/auth/login",
        json={"email": VALID_USER["email"], "password": VALID_USER["password"]},
    )
    token = login_response.json()["access_token"]

    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == VALID_USER["email"]
    assert "password_hash" not in body


async def test_me_no_token_returns_401(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_me_garbage_token_returns_401(client):
    response = await client.get(
        "/auth/me", headers={"Authorization": "Bearer garbage.not.a.jwt"}
    )
    assert response.status_code == 401


async def test_me_expired_token_returns_401(client, db_session):
    await register_user(client)
    user = await get_user_from_db(db_session)

    expired_payload = {
        "sub": str(user.id),
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    token = jwt.encode(expired_payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


async def test_me_token_signed_with_wrong_secret_returns_401(client, db_session):
    await register_user(client)
    user = await get_user_from_db(db_session)

    forged_payload = {
        "sub": str(user.id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    token = jwt.encode(forged_payload, "not-the-real-secret", algorithm=settings.jwt_algorithm)

    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
