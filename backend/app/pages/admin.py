"""
Server-rendered administration pages.
"""

import difflib
import math
import re
from dataclasses import dataclass

from fastapi import APIRouter, Request, status
from fastapi.responses import Response
from tortoise.expressions import Q
from tortoise.models import Model
from tortoise.queryset import QuerySet

from ..auth.dependencies import OptionalUser
from ..models.doc import Doc
from ..models.revision import Revision
from ..models.upload import Upload
from ..models.user import User
from ..schemas.role import ADMIN_ROLES, EDITOR_ROLES, Role
from ..settings import settings
from ..utils.indexing import get_index_status
from .common import message_response, restricted_page
from .rendering import PageRoute, html_response, page_response, render_template

router = APIRouter(route_class=PageRoute)

PAGE_SIZES = (1, 2, 5, 10, 20, 50, 100)
DEFAULT_PAGE_SIZE = 10

ROLE_NAMES = {Role.USER: "User", Role.ADMIN: "Admin", Role.VIEWER: "Viewer"}


@dataclass
class Pagination:
    """
    The current page of a paginated list, from the page and size query parameters.
    A size of -1 shows all items.
    """

    page: int
    size: int
    total: int
    sizes: tuple[int, ...] = PAGE_SIZES

    @classmethod
    def from_request(cls, request: Request, total: int) -> "Pagination":
        def param(name: str, default: int) -> int:
            try:
                return int(request.query_params.get(name, default))
            except ValueError:
                return default

        size = param("size", DEFAULT_PAGE_SIZE)
        if size != -1 and size not in PAGE_SIZES:
            size = DEFAULT_PAGE_SIZE
        return cls(page=max(1, param("page", 1)), size=size, total=total)

    @property
    def pages(self) -> int:
        if self.size == -1:
            return 1 if self.total else 0
        return math.ceil(self.total / self.size)

    def url(self, page: int) -> str:
        return f"?page={page}&size={self.size}"

    def apply[M: Model](self, queryset: QuerySet[M]) -> QuerySet[M]:
        if self.size == -1:
            return queryset
        return queryset.offset((self.page - 1) * self.size).limit(self.size)


async def paginate[M: Model](
    request: Request, queryset: QuerySet[M]
) -> tuple[list[M], Pagination]:
    pagination = Pagination.from_request(request, await queryset.count())
    return await pagination.apply(queryset), pagination


# Words, runs of whitespace and individual punctuation characters
_DIFF_TOKEN_RE = re.compile(r"\w+|\s+|[^\w\s]")


def word_diff(old: str, new: str) -> list[tuple[str, str]]:
    """
    Compare two texts word by word.
    Returns (kind, text) pairs, where kind is "added", "removed" or "".
    """
    old_tokens = _DIFF_TOKEN_RE.findall(old)
    new_tokens = _DIFF_TOKEN_RE.findall(new)
    matcher = difflib.SequenceMatcher(None, old_tokens, new_tokens, autojunk=False)
    parts = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            parts.append(("", "".join(new_tokens[j1:j2])))
            continue
        if i2 > i1:
            parts.append(("removed", "".join(old_tokens[i1:i2])))
        if j2 > j1:
            parts.append(("added", "".join(new_tokens[j1:j2])))
    return parts


@router.get("/_admin")
async def admin_page(request: Request, current_user: OptionalUser) -> Response:
    _, context, denied = await restricted_page(request, current_user, EDITOR_ROLES)
    if denied:
        return denied
    return page_response(request, "admin/index.html", context)


@router.get("/_users")
async def users_page(request: Request, current_user: OptionalUser) -> Response:
    _, context, denied = await restricted_page(request, current_user, ADMIN_ROLES)
    if denied:
        return denied
    users, pagination = await paginate(request, User.all().order_by("username"))
    return page_response(
        request,
        "admin/users.html",
        {
            **context,
            "users": users,
            "pagination": pagination,
            "role_names": ROLE_NAMES,
        },
    )


@router.get("/_uploads")
async def uploads_page(request: Request, current_user: OptionalUser) -> Response:
    tree, context, denied = await restricted_page(request, current_user, EDITOR_ROLES)
    if denied:
        return denied
    uploads, pagination = await paginate(
        request, Upload.all().order_by("filename", "created_at")
    )
    return page_response(
        request,
        "admin/uploads.html",
        {
            **context,
            "uploads": uploads,
            "pagination": pagination,
            "docs": tree.nodes,
            "doc_options": sorted(tree.nodes.values(), key=lambda n: n.title.lower()),
        },
    )


@router.get("/_settings")
async def settings_page(request: Request, current_user: OptionalUser) -> Response:
    _, context, denied = await restricted_page(request, current_user, ADMIN_ROLES)
    if denied:
        return denied
    return page_response(request, "admin/settings.html", context)


@router.get("/_search-index")
async def search_index_page(request: Request, current_user: OptionalUser) -> Response:
    _, context, denied = await restricted_page(request, current_user, ADMIN_ROLES)
    if denied:
        return denied
    return page_response(
        request,
        "admin/search_index.html",
        {
            **context,
            "doc_count": await Doc.all().count(),
            "search_disabled": settings.disable_search,
            "index": None if settings.disable_search else await get_index_status(),
        },
    )


@router.get("/_revisions/{doc_id:int}")
async def revisions_page(
    request: Request, current_user: OptionalUser, doc_id: int
) -> Response:
    _, context, denied = await restricted_page(request, current_user, EDITOR_ROLES)
    if denied:
        return denied
    doc = await Doc.get_or_none(id=doc_id)
    if doc is None:
        return message_response(
            request,
            context,
            "Not Found",
            "The document you are looking for does not exist.",
            status.HTTP_404_NOT_FOUND,
        )
    revisions, pagination = await paginate(
        request,
        Revision.filter(doc_id=doc.id)
        .order_by("-created_at", "-id")
        .prefetch_related("created_by"),
    )
    return page_response(
        request,
        "admin/revisions.html",
        {**context, "doc": doc, "revisions": revisions, "pagination": pagination},
    )


@router.get("/_partial/revision/{revision_id}")
async def revision_partial(
    request: Request, current_user: OptionalUser, revision_id: int
) -> Response:
    """
    The details of a revision, shown in a dialog on the revisions page.
    """
    if current_user is None or not current_user.can_edit:
        return Response(status_code=status.HTTP_403_FORBIDDEN)
    revision = await Revision.get_or_none(id=revision_id).prefetch_related("created_by")
    if revision is None:
        return Response(status_code=status.HTTP_404_NOT_FOUND)
    previous = (
        await Revision.filter(
            Q(created_at__lt=revision.created_at)
            | Q(created_at=revision.created_at, id__lt=revision.id),
            doc_id=revision.doc_id,
        )
        .order_by("-created_at", "-id")
        .first()
    )
    html = render_template(
        "admin/revision.html",
        {
            "revision": revision,
            "diff": word_diff(previous.markdown, revision.markdown)
            if previous
            else None,
        },
    )
    return html_response(request, html, partial=True)
