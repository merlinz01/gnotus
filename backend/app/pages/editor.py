"""
Server-rendered pages for creating and editing documents.
"""

from fastapi import APIRouter, Request, status
from fastapi.responses import Response

from ..auth.dependencies import OptionalUser
from ..models.doc import Doc
from ..models.upload import Upload
from ..schemas.role import EDITOR_ROLES
from .common import message_response, restricted_page
from .rendering import PageRoute, html_response, page_response, render_template

router = APIRouter(route_class=PageRoute)


@router.get("/_new")
async def new_doc_page(
    request: Request, current_user: OptionalUser, parent: str | None = None
) -> Response:
    tree, context, denied = await restricted_page(request, current_user, EDITOR_ROLES)
    if denied:
        return denied
    # Taken as a string so that an invalid ID is ignored instead of failing validation
    try:
        parent_id = int(parent) if parent else None
    except ValueError:
        parent_id = None
    return page_response(
        request,
        "editor/new.html",
        {**context, "parent_options": tree.flatten(), "parent_id": parent_id},
    )


@router.get("/_edit/{doc_id:int}")
async def edit_doc_page(
    request: Request, current_user: OptionalUser, doc_id: int
) -> Response:
    tree, context, denied = await restricted_page(request, current_user, EDITOR_ROLES)
    if denied:
        return denied
    doc = await Doc.get_or_none(id=doc_id)
    node = tree.nodes.get(doc_id)
    if doc is None or node is None:
        return message_response(
            request,
            context,
            "Not Found",
            "The document you are looking for does not exist.",
            status.HTTP_404_NOT_FOUND,
        )
    # A document can't be moved under itself or its descendants
    exclude = {doc.id} | tree.descendant_ids(node)
    return page_response(
        request,
        "editor/edit.html",
        {
            **context,
            "doc": doc,
            "is_home": doc.parent_id is None,
            "parent_options": tree.flatten(exclude),
            "uploads": await Upload.filter(doc_id=doc.id),
        },
    )


@router.get("/_partial/attachments/{doc_id}")
async def attachments_partial(
    request: Request, current_user: OptionalUser, doc_id: int
) -> Response:
    """
    The list of a document's attachments, shown in the editor.
    """
    if current_user is None or not current_user.can_edit:
        return Response(status_code=status.HTTP_403_FORBIDDEN)
    uploads = await Upload.filter(doc_id=doc_id)
    html = render_template("editor/attachments.html", {"uploads": uploads})
    return html_response(request, html, partial=True)
