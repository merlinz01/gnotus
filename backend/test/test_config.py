from fastapi import status
from utils import TestClient

from app.models.setting import Setting
from app.models.user import User


async def test_get_config_defaults(api_client: TestClient):
    """
    Test that the config endpoint returns default values when no settings exist.
    """
    response = api_client.get("/api/config.json")

    assert response.status_code == 200
    data = response.json()
    assert data == {
        "site_name": "Gnotus",
        "primary_color": "#4A90E2",
        "secondary_color": "#50E3C2",
        "primary_color_dark": "#4A90E2",
        "secondary_color_dark": "#50E3C2",
        "site_icon_upload_id": None,
    }


async def test_get_config_from_database(api_client: TestClient):
    """
    Test that the config endpoint returns values from the database.
    """
    await Setting.set_value("site_name", "Test Site")
    await Setting.set_value("primary_color", "#FF0000")

    response = api_client.get("/api/config.json")

    assert response.status_code == 200
    data = response.json()
    assert data["site_name"] == "Test Site"
    assert data["primary_color"] == "#FF0000"


async def test_update_config(api_client: TestClient, user_admin: User):
    """
    Test that admin can update site configuration.
    """
    api_client.set_session_user(user_admin)

    response = api_client.put(
        "/api/config.json",
        json={
            "site_name": "Updated Site",
            "primary_color": "#00FF00",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["site_name"] == "Updated Site"
    assert data["primary_color"] == "#00FF00"

    # Verify persisted
    assert await Setting.get_value("site_name") == "Updated Site"
    assert await Setting.get_value("primary_color") == "#00FF00"


async def test_update_config_partial(api_client: TestClient, user_admin: User):
    """
    Test that partial updates only change specified fields.
    """
    await Setting.set_value("site_name", "Original Name")
    await Setting.set_value("primary_color", "#111111")

    api_client.set_session_user(user_admin)

    response = api_client.put(
        "/api/config.json",
        json={
            "site_name": "New Name",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["site_name"] == "New Name"
    assert data["primary_color"] == "#111111"  # Unchanged


async def test_update_config_forbidden_for_non_admin(
    api_client: TestClient, user_user: User
):
    """
    Test that non-admin users cannot update configuration.
    """
    api_client.set_session_user(user_user)

    response = api_client.put(
        "/api/config.json",
        json={"site_name": "Hacked"},
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "Only admins can update site configuration"


async def test_update_config_unauthorized(api_client: TestClient):
    """
    Test that unauthenticated users cannot update configuration.
    """
    response = api_client.put(
        "/api/config.json",
        json={"site_name": "Hacked"},
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_icon_svg(api_client: TestClient):
    """
    Test that the icon SVG endpoint returns the expected SVG content.
    """
    response = api_client.get("/api/icon")

    assert response.status_code == 200
    assert response.headers["Content-Type"] == "image/svg+xml"
    assert b"<svg" in response.content


async def test_upload_icon(api_client: TestClient, user_admin: User):
    """
    Test that admin can upload a custom icon.
    """
    api_client.set_session_user(user_admin)

    # Minimal valid PNG
    png_data = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    response = api_client.post(
        "/api/icon",
        files={"file": ("icon.png", png_data, "image/png")},
    )

    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["content_type"] == "image/png"

    # Verify icon is now served
    icon_response = api_client.get("/api/icon")
    assert icon_response.status_code == 200
    assert icon_response.headers["Content-Type"] == "image/png"


async def test_upload_icon_forbidden_for_non_admin(
    api_client: TestClient, user_user: User
):
    """
    Test that non-admin cannot upload icon.
    """
    api_client.set_session_user(user_user)

    response = api_client.post(
        "/api/icon",
        files={"file": ("icon.png", b"test", "image/png")},
    )

    assert response.status_code == 403


async def test_upload_icon_invalid_extension(api_client: TestClient, user_admin: User):
    """
    Test that invalid file extensions are rejected.
    """
    api_client.set_session_user(user_admin)

    response = api_client.post(
        "/api/icon",
        files={"file": ("icon.txt", b"test", "text/plain")},
    )

    assert response.status_code == 400
    assert "not allowed" in response.json()["detail"]


async def test_delete_icon(api_client: TestClient, user_admin: User):
    """
    Test that admin can revert to default icon.
    """
    api_client.set_session_user(user_admin)

    # First upload an icon
    png_data = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    api_client.post(
        "/api/icon",
        files={"file": ("icon.png", png_data, "image/png")},
    )

    # Delete the custom icon
    response = api_client.delete("/api/icon")
    assert response.status_code == 204

    # Verify default icon is served again
    icon_response = api_client.get("/api/icon")
    assert icon_response.status_code == 200
    assert icon_response.headers["Content-Type"] == "image/svg+xml"


async def test_delete_icon_forbidden_for_non_admin(
    api_client: TestClient, user_user: User
):
    """
    Test that non-admin cannot delete icon.
    """
    api_client.set_session_user(user_user)

    response = api_client.delete("/api/icon")
    assert response.status_code == 403
