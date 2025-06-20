from xml.etree import ElementTree as ET

from fastapi import APIRouter
from fastapi.responses import Response

from ..models.doc import Doc
from ..settings import settings

router = APIRouter()


@router.get("/robots.txt")
async def robots_txt() -> Response:
    """
    Returns the robots.txt file.
    """
    content = (
        "User-agent: *\nDisallow: /api/\nAllow: /\n"
        f"\nSitemap: {settings.base_url}/api/sitemap.xml\n"
    )
    return Response(content=content, media_type="text/plain")


@router.get("/sitemap.xml")
async def sitemap() -> Response:
    """
    Returns the sitemap.xml file.
    """
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    async for doc in Doc.filter(public=True):
        url = ET.SubElement(urlset, "url")
        loc = ET.SubElement(url, "loc")
        loc.text = settings.base_url + "/" + doc.urlpath
        lastmod = ET.SubElement(url, "lastmod")
        lastmod.text = doc.updated_at.isoformat(timespec="seconds")
    content = ET.tostring(urlset, encoding="utf-8", xml_declaration=True)
    return Response(content=content, media_type="application/xml; charset=utf-8")
