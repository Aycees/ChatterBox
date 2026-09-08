from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_password_is_random_per_call():
    password = "correct-horse-battery-staple"
    assert hash_password(password) != hash_password(password)


def test_verify_password_accepts_correct_and_rejects_incorrect():
    password = "correct-horse-battery-staple"
    hashed = hash_password(password)
    assert verify_password(password, hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_create_and_decode_access_token_round_trip():
    token = create_access_token("some-user-id")
    payload = decode_access_token(token)
    assert payload["sub"] == "some-user-id"


def test_decode_access_token_rejects_expired_token():
    expired_payload = {
        "sub": "some-user-id",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    token = jwt.encode(expired_payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_decode_access_token_rejects_tampered_token():
    token = create_access_token("some-user-id")
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(tampered)
