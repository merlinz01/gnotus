"""
Plain files served alongside the pages: robots.txt, the sitemap and the
Markdown versions of documents.
"""

from xml.etree import ElementTree as ET

from fastapi import HTTPException, status
from fastapi.responses import PlainTextResponse, Response

from ..auth.dependencies import OptionalUser
from ..models.doc import Doc
from ..settings import settings


async def robots_txt() -> Response:
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Allow: /api/icon\n"
        "Allow: /api/uploads/\n"
        "Disallow: /_partial/\n"
        f"\nSitemap: {settings.base_url}/sitemap.xml\n"
    )
    return PlainTextResponse(content)


async def sitemap_xml() -> Response:
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    async for doc in Doc.filter(public=True):
        url = ET.SubElement(urlset, "url")
        loc = ET.SubElement(url, "loc")
        loc.text = settings.base_url + doc.urlpath
        lastmod = ET.SubElement(url, "lastmod")
        lastmod.text = doc.updated_at.isoformat(timespec="seconds")
    content = ET.tostring(urlset, encoding="utf-8", xml_declaration=True)
    return Response(content=content, media_type="application/xml; charset=utf-8")


async def doc_markdown(current_user: OptionalUser, path: str) -> Response:
    """
    The Markdown of a document, with its title and links to its children.
    """
    doc = await Doc.get_or_none(urlpath="/" + path)
    if doc is None or (not doc.public and current_user is None):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    children = doc.children.all().order_by("order", "title")
    if current_user is None:
        children = children.filter(public=True)
    lines = [f"# {doc.title}\n"]
    child_list = [child async for child in children]
    if child_list:
        lines.append("\n")
        lines.extend(f"- [{child.title}]({child.urlpath})\n" for child in child_list)
    lines.append(f"\n{doc.markdown}")
    return PlainTextResponse("".join(lines))
