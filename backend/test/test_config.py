from app.models.setting import Setting
from app.models.user import User
from fastapi import status
from utils import TestClient


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
    response = api_client.get("/api/icon.svg")

    assert response.status_code == 200
    assert response.headers["Content-Type"] == "image/svg+xml"
    assert b"<svg" in response.content
