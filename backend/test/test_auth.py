from app.models import User
from fastapi import status
from utils import TestClient


async def test_auth_user(api_client: TestClient, user_user: User):
    """
    Test that the auth user endpoint returns the expected user data.
    """
    api_client.set_session_user(user_user)
    response = api_client.get("/api/auth/user")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == user_user.id
    assert data["username"] == user_user.username


async def test_auth_login(api_client: TestClient, user_user: User):
    """
    Test that the auth login endpoint returns the expected user data.
    """
    from app.settings import settings

    response = api_client.post(
        "/api/auth/login",
        json={
            "username": user_user.username,
            "password": "user_password",
        },
    )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["user"]["id"] == user_user.id
    assert data["user"]["username"] == user_user.username
    assert settings.session_cookie in api_client.cookies


async def test_auth_login_invalid_user(api_client: TestClient):
    """
    Test that the auth login endpoint returns 401 for invalid username.
    """
    from app.settings import settings

    response = api_client.post(
        "/api/auth/login",
        json={
            "username": "invalid_user",
            "password": "user_password",
        },
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Invalid credentials"}
    assert settings.session_cookie not in api_client.cookies


async def test_auth_login_invalid_password(api_client: TestClient, user_user: User):
    """
    Test that the auth login endpoint returns 401 for invalid password.
    """
    from app.settings import settings

    response = api_client.post(
        "/api/auth/login",
        json={
            "username": user_user.username,
            "password": "wrong_password",
        },
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Invalid credentials"}
    assert settings.session_cookie not in api_client.cookies


async def test_login_inactive_user(api_client: TestClient, user_admin: User):
    """
    Test that an inactive user cannot log in.
    """
    user_admin.is_active = False
    await user_admin.save()
    response = api_client.post(
        "/api/auth/login",
        json={"username": user_admin.username, "password": "admin_password"},
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Invalid credentials"}


async def test_auth_logout(api_client: TestClient, user_user: User):
    """
    Test that the auth logout endpoint clears the session.
    """
    from app.settings import settings

    api_client.set_session_user(user_user)
    response = api_client.post("/api/auth/logout")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert response.headers.get_list("Set-Cookie")[0].startswith('csrftoken="";')
    assert response.headers.get_list("Set-Cookie")[1].startswith(
        f"{settings.session_cookie}=null;"
    )


async def test_protected_endpoint_unauthenticated(api_client: TestClient):
    """
    Test that accessing a protected endpoint without authentication returns 401.
    """
    response = api_client.get("/api/auth/user")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Not authenticated"}
