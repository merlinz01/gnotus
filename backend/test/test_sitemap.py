from app.models.doc import Doc
from utils import TestClient


async def test_robots_txt(api_client: TestClient) -> None:
    """
    Test the robots.txt endpoint.
    """
    from app.settings import settings

    response = api_client.get("/api/robots.txt")
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "text/plain; charset=utf-8"
    assert response.text == (
        "User-agent: *\nAllow: /api/sitemap.xml\nDisallow: /api/\nAllow: /\n"
        f"\nSitemap: {settings.base_url}/api/sitemap.xml\n"
    )


async def test_sitemap(api_client: TestClient) -> None:
    """
    Test the sitemap.xml endpoint.
    """
    from app.settings import settings

    # Create a test document
    doc1 = await Doc.create(
        title="Test Document",
        html="",
        public=True,
        urlpath="test-document",
        metadata={},
        markdown="",
    )
    doc2 = await Doc.create(
        title="Another Document",
        html="",
        public=True,
        urlpath="another-document",
        metadata={},
        markdown="",
    )

    response = api_client.get("/api/sitemap.xml")
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
