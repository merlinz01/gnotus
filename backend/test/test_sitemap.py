from utils import TestClient

from app.models.doc import Doc


async def test_robots_txt(api_client: TestClient) -> None:
    """
    Test the robots.txt endpoint.
    """
    from app.settings import settings

    response = api_client.get("/robots.txt")
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "text/plain; charset=utf-8"
    assert response.text == (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Allow: /api/icon\n"
        "Allow: /api/uploads/\n"
        "Disallow: /_partial/\n"
        f"\nSitemap: {settings.base_url}/sitemap.xml\n"
    )
    response = api_client.head("/robots.txt")
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "text/plain; charset=utf-8"


async def test_sitemap(api_client: TestClient) -> None:
    """
    Test the sitemap.xml endpoint.
    """
    from app.settings import settings

    # Create a test document
    doc1 = await Doc.create(
        title="Test Document",
        slug="test-document",
        urlpath="/test-document",
        html="",
        public=True,
        markdown="",
    )
    doc2 = await Doc.create(
        title="Another Document",
        slug="another-document",
        urlpath="/another-document",
        html="",
        public=True,
        markdown="",
    )

    response = api_client.get("/sitemap.xml")
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "application/xml; charset=utf-8"

    assert response.text == (
        "<?xml version='1.0' encoding='utf-8'?>\n"
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        "<url>"
        f"<loc>{settings.base_url}/another-document</loc>"
        f"<lastmod>{doc2.updated_at.isoformat(timespec='seconds')}</lastmod>"
        "</url>"
        "<url>"
        f"<loc>{settings.base_url}/test-document</loc>"
        f"<lastmod>{doc1.updated_at.isoformat(timespec='seconds')}</lastmod>"
        "</url>"
        "</urlset>"
    )
    response = api_client.head("/sitemap.xml")
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "application/xml; charset=utf-8"


async def test_favicon(api_client: TestClient) -> None:
    """
    Test that the site icon is also served where browsers look for it.
    """
    response = api_client.get("/favicon.ico")
    assert response.status_code == 200
    assert response.content == api_client.get("/api/icon").content
