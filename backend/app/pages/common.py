"""
Helpers shared by the server-rendered pages.
"""

import re
from collections.abc import Collection
from typing import Any
from urllib.parse import quote

from fastapi import Request, status
from fastapi.responses import RedirectResponse, Response

from ..models.setting import get_site_config
from ..models.user import User
from ..schemas.role import Role
from ..settings import settings
from .rendering import page_response
from .tree import DocTree, load_doc_tree, outline_version

# CSS custom properties set from the site configuration
_THEME_PROPERTIES = {
    "primary_color": "--gnotus-primary",
    "secondary_color": "--gnotus-secondary",
    "primary_color_dark": "--gnotus-primary-dark",
    "secondary_color_dark": "--gnotus-secondary-dark",
}

# Characters allowed in color values, so they can't break out of the declaration
_COLOR_RE = re.compile(r"^[#\w\s(),.%/+-]+$")


async def load_site_config() -> dict[str, Any]:
    return (await get_site_config()).model_dump()


def theme_style(config: dict[str, Any]) -> str:
    return "; ".join(
        f"{prop}: {config[key]}"
        for key, prop in _THEME_PROPERTIES.items()
        if isinstance(config.get(key), str) and _COLOR_RE.match(config[key])
    )


def open_paths(path: str) -> set[str]:
    """
    Get the URL paths of a page and its ancestors, which are expanded in the sidebar.
    """
    segments = path.strip("/").split("/")
    return {"/" + "/".join(segments[: i + 1]) for i in range(len(segments))}


async def page_context(
    request: Request, user: User | None, tree: DocTree, path: str | None = None
) -> dict[str, Any]:
    """
    Get the template context shared by all pages.
    """
    if path is None:
        path = request.url.path
    config = await load_site_config()
    outline = tree.home
    return {
        "config": config,
        "site_name": config["site_name"],
        "theme_style": theme_style(config),
        "user": user,
        "is_admin": user is not None and user.is_admin,
        "can_edit": user is not None and user.can_edit,
        "outline": outline,
        "outline_version": outline_version(outline, user),
        "current_path": path,
        "open_paths": open_paths(path),
        "sidebar_open": request.cookies.get("sidebar_open") == "1",
        "base_url": settings.base_url,
    }


def message_response(
    request: Request,
    context: dict[str, Any],
    title: str,
    message: str,
    status_code: int,
) -> Response:
    """
    Render a page that only shows an error message.
    """
    return page_response(
        request,
        "message.html",
        {**context, "page_title": title, "message": message},
        status_code,
    )


def login_redirect(request: Request) -> Response:
    """
    Redirect to the login page, returning to the current page afterwards.
    """
    path = request.url.path
    query = request.url.remove_query_params("_partial").query
    if query:
        path += "?" + query
    return RedirectResponse(
        "/_login?next=" + quote(path, safe=""), status_code=status.HTTP_303_SEE_OTHER
    )


async def restricted_page(
    request: Request, user: User | None, roles: Collection[Role]
) -> tuple[DocTree, dict[str, Any], Response | None]:
    """
    Get the document tree and context for a page that requires one of the roles.
    If the user may not see the page, the response to send instead is also returned.
    """
    tree = await load_doc_tree(user)
    context = await page_context(request, user, tree)
    if user is None:
        return tree, context, login_redirect(request)
    if user.role not in roles:
        return (
            tree,
            context,
            message_response(
                request,
                context,
                "Forbidden",
                "You do not have permission to view this page.",
                status.HTTP_403_FORBIDDEN,
            ),
        )
    return tree, context, None
