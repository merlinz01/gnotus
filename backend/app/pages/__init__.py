"""
Server-rendered pages.

Each page is available in full, or as a partial (with ?_partial=1) containing
only the page metadata and main content, which the client-side script swaps in
when navigating between pages.
"""

from typing import Any

from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse, Response
from starlette.convertors import Convertor, register_url_convertor

from ..api.config import get_icon
from ..auth.dependencies import OptionalUser
from ..models.doc import Doc
from ..models.sharelink import ShareableLink
from .admin import router as admin_router
from .common import message_response, page_context
from .editor import router as editor_router
from .files import doc_markdown, robots_txt, sitemap_xml
from .rendering import (
    PageRoute,
    etag_matches,
    get_static_asset,
    html_response,
    page_response,
)
from .tree import load_doc_tree


class PagePathConvertor(Convertor[str]):
    """
    Matches any path except those reserved for the API and static assets.
    """

    regex = r"(?!(?:api|_static|_partial)(?:/|$)).*"

    def convert(self, value: str) -> str:
        return value

    def to_string(self, value: str) -> str:  # pragma: no cover
        return value


register_url_convertor("pagepath", PagePathConvertor())

router = APIRouter(include_in_schema=False, route_class=PageRoute)

_NOT_FOUND_MESSAGE = (
    "The document you are looking for does not exist, "
    "or you do not have permission to view it."
)


def summarize(html: str, length: int = 160) -> str:
    """
    Get a plain-text summary of HTML content for the meta description.
    """
    soup = BeautifulSoup(html, "html.parser")
    for anchor in soup.select("a.heading-anchor"):
        anchor.decompose()
    text = " ".join(soup.get_text(" ").split())
    if len(text) <= length:
        return text
    return text[:length].rsplit(" ", 1)[0] + "…"


def not_found_response(request: Request, context: dict[str, Any]) -> Response:
    return message_response(
        request, context, "Not Found", _NOT_FOUND_MESSAGE, status.HTTP_404_NOT_FOUND
    )


# Files that browsers and crawlers expect at the root of the site
router.add_api_route("/robots.txt", robots_txt)
router.add_api_route("/sitemap.xml", sitemap_xml)
router.add_api_route("/favicon.ico", get_icon)


@router.get("/_static/{name}")
async def static_asset(request: Request, name: str) -> Response:
    asset = get_static_asset(name)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if request.query_params.get("v") == asset.version:
        cache_control = "public, max-age=31536000, immutable"
    else:
        cache_control = "no-cache"
    headers = {"ETag": f'"{asset.version}"', "Cache-Control": cache_control}
    if etag_matches(request, headers["ETag"]):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(asset.content, media_type=asset.media_type, headers=headers)


@router.get("/_partial/sidebar")
async def sidebar_partial(
    request: Request, current_user: OptionalUser, path: str = "/"
) -> Response:
    tree = await load_doc_tree(current_user)
    context = await page_context(request, current_user, tree, path)
    return html_response(request, context["sidebar"], partial=True)


def safe_next_path(next: str | None) -> str:
    """
    Get the path to go to after logging in, allowing only local paths.
    """
    # Browsers ignore some control characters and treat backslashes as slashes,
    # so "/\t/example.com" or "/\\example.com" would lead to another site
    if (
        next
        and next.startswith("/")
        and not next.startswith(("//", "/\\"))
        and not any(ord(c) < 0x20 or ord(c) == 0x7F for c in next)
    ):
        return next
    return "/"


@router.get("/_login")
async def login_page(
    request: Request, current_user: OptionalUser, next: str | None = None
) -> Response:
    next_path = safe_next_path(next)
    if current_user is not None:
        return RedirectResponse(next_path, status_code=status.HTTP_303_SEE_OTHER)
    tree = await load_doc_tree(current_user)
    context = await page_context(request, current_user, tree, request.url.path)
    return page_response(request, "login.html", {**context, "next": next_path})


@router.get("/_logout")
async def logout_page(request: Request, current_user: OptionalUser) -> Response:
    tree = await load_doc_tree(current_user)
    context = await page_context(request, current_user, tree, request.url.path)
    return page_response(request, "logout.html", context)


@router.get("/_share/{token}")
async def shared_doc_page(
    request: Request, current_user: OptionalUser, token: str
) -> Response:
    tree = await load_doc_tree(current_user)
    context = await page_context(request, current_user, tree, request.url.path)
    link = await ShareableLink.get_or_none(token=token).prefetch_related("doc")
    if link is None:
        return message_response(
            request,
            context,
            "Invalid Share Link",
            "This share link is invalid or has been revoked.",
            status.HTTP_404_NOT_FOUND,
        )
    if link.is_expired():
        return message_response(
            request,
            context,
            "Expired Share Link",
            "This share link has expired.",
            status.HTTP_410_GONE,
        )
    await link.record_access()
    doc = link.doc
    # Private documents can be shared, but aren't in anonymous users' trees
    children = (
        await Doc.filter(parent_id=doc.id, public=True)
        .order_by("order", "title")
        .only("id", "title", "urlpath")
    )
    return page_response(
        request,
        "shared.html",
        {
            **context,
            "doc": doc,
            "parents": tree.parents(doc.parent_id),
            "children": children,
        },
    )


router.include_router(admin_router)
router.include_router(editor_router)


# Slugs can't contain dots, so this can't shadow a document page
router.add_api_route("/{path:pagepath}.md", doc_markdown)


# Must come last, since it matches any path
@router.get("/{path:pagepath}")
async def doc_page(request: Request, current_user: OptionalUser, path: str) -> Response:
    if path.endswith("/"):
        # Stripping leading slashes too keeps "//example.com/" from leading to another site
        target = "/" + path.strip("/")
        if request.url.query:
            target += "?" + request.url.query
        return RedirectResponse(target, status_code=status.HTTP_308_PERMANENT_REDIRECT)
    urlpath = "/" + path

    if urlpath == "/":
        tree = await load_doc_tree(current_user)
        context = await page_context(request, current_user, tree, urlpath)
        # The tree only has the home page if the user may see it
        home = await Doc.get_or_none(id=tree.home.id) if tree.home else None
        return page_response(
            request,
            "home.html",
            {
                **context,
                "home": home,
                "sections": context["outline"].children if context["outline"] else [],
                "description": summarize(home.html) if home else "",
            },
        )

    doc = await Doc.get_or_none(urlpath=urlpath)
    tree = await load_doc_tree(current_user)
    context = await page_context(request, current_user, tree, urlpath)
    node = tree.nodes.get(doc.id) if doc is not None else None
    if doc is None or node is None or (not doc.public and current_user is None):
        return not_found_response(request, context)
    return page_response(
        request,
        "doc.html",
        {
            **context,
            "doc": doc,
            "parents": tree.parents(node.parent_id),
            "children": node.children,
            "description": summarize(doc.html),
        },
    )
