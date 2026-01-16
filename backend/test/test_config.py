from utils import TestClient


def test_config(api_client: TestClient):
    """
    Test that the config endpoint returns the expected configuration.
    """
    from app.settings import settings

    settings.site_name = "Gnotus"
    settings.primary_color = "#4A90E2"
    settings.secondary_color = "#50E3C2"
    settings.primary_color_dark = "#6B6Ef0"
    settings.secondary_color_dark = "#8FBC8F"

    response = api_client.get("/api/config.json")

    assert response.status_code == 200
    data = response.json()
    assert data == {
        "site_name": "Gnotus",
        "primary_color": "#4A90E2",
        "secondary_color": "#50E3C2",
        "primary_color_dark": "#6B6Ef0",
        "secondary_color_dark": "#8FBC8F",
    }


def test_icon_svg(api_client: TestClient):
    """
    Test that the icon SVG endpoint returns the expected SVG content.
    """
    response = api_client.get("/api/icon.svg")

    assert response.status_code == 200
    assert response.headers["Content-Type"] == "image/svg+xml"
    assert b"<svg" in response.content
