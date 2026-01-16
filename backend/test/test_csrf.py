from fastapi import status
from utils import TestClient

from app.models.doc import Doc
from app.models.user import User


async def test_csrf_protected_endpoint(api_client: TestClient, user_admin: User):
    """
    Test that a CSRF-protected endpoint returns 200 OK when accessed with a valid CSRF token.
    """
    api_client.set_session_user(user_admin)
    home = await Doc.create(
        title="Home",
        slug="",
        urlpath="/",
        public=True,
        metadata={},
        markdown="",
        html="",
    )
    response = api_client.post(
        "/api/docs",
        json={
            "title": "Test Document",
            "slug": "test-document",
            "parent_id": home.id,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text


async def test_csrf_protected_endpoint_invalid_token(
    api_client: TestClient, user_admin: User
):
    """
    Test that a CSRF-protected endpoint returns 403 Forbidden when accessed with an invalid CSRF token.
    """
    api_client.set_session_user(user_admin)
    api_client.headers["x-csrftoken"] = "invalid_token"
    response = api_client.post(
        "/api/docs",
        json={
            "title": "Test Document",
            "content": "This is a test.",
            "slug": "test-document",
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "CSRF token is missing or invalid"}
