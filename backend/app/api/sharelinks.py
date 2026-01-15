from datetime import datetime, timedelta, timezone
from logging import getLogger

from fastapi import APIRouter, HTTPException, status
from tortoise.exceptions import DoesNotExist

from ..auth.dependencies import LoggedInUser
from ..models.doc import Doc
from ..models.sharelink import ShareableLink
from ..schemas.role import Role
from ..schemas.doc import DocInfo, DocResponse
from ..schemas.sharelink import ShareLinkCreate, ShareLinkResponse

logger = getLogger(__name__)
router = APIRouter(prefix="/sharelinks", tags=["sharelinks"])


def _to_response(link: ShareableLink) -> ShareLinkResponse:
    return ShareLinkResponse(
        id=link.id,
        token=link.token,
        doc_id=link.doc_id,
        created_by_id=link.created_by_id,
        expires_at=link.expires_at,
        last_accessed_at=link.last_accessed_at,
        access_count=link.access_count,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_sharelink(
    current_user: LoggedInUser,
    link_create: ShareLinkCreate,
) -> ShareLinkResponse:
    """
    Create a new shareable link for a document.
    """
    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create share links",
        )

    try:
        doc = await Doc.get(id=link_create.doc_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Calculate expiration date
    expires_at: datetime | None = None
    if link_create.expiration == "7days":
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    elif link_create.expiration == "30days":
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    # "never" means expires_at stays None

    link = await ShareableLink.create(
        token=ShareableLink.generate_token(),
        doc_id=doc.id,
        created_by_id=current_user.id,
        expires_at=expires_at,
    )

    logger.info(
        f"Share link created for document '{doc.title}' by user {current_user.username}."
    )
    return _to_response(link)


@router.get("/")
async def list_sharelinks(
    current_user: LoggedInUser,
    doc_id: int,
) -> list[ShareLinkResponse]:
    """
    List all shareable links for a specific document.
    Admins can see all links; other users only see links they created.
    """
    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view share links",
        )

    try:
        await Doc.get(id=doc_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Admins can see all links; other users only see their own
    if current_user.role == Role.ADMIN:
        links = await ShareableLink.filter(doc_id=doc_id)
    else:
        links = await ShareableLink.filter(doc_id=doc_id, created_by_id=current_user.id)
    return [_to_response(link) for link in links]


@router.get("/{link_id}")
async def get_sharelink(
    current_user: LoggedInUser,
    link_id: int,
) -> ShareLinkResponse:
    """
    Get a specific shareable link by ID.
    Admins can view any link; other users can only view links they created.
    """
    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view share links",
        )

    try:
        link = await ShareableLink.get(id=link_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found",
        )

    # Non-admin users can only view their own links
    if current_user.role != Role.ADMIN and link.created_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found",
        )

    return _to_response(link)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sharelink(
    current_user: LoggedInUser,
    link_id: int,
) -> None:
    """
    Delete/revoke a shareable link.
    Admins can delete any link; other users can only delete links they created.
    """
    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete share links",
        )

    try:
        link = await ShareableLink.get(id=link_id).prefetch_related("doc")
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found",
        )

    # Non-admin users can only delete their own links
    if current_user.role != Role.ADMIN and link.created_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found",
        )

    doc_title = link.doc.title
    await link.delete()
    logger.info(
        f"Share link for document '{doc_title}' deleted by user {current_user.username}."
    )


@router.get("/access/{token}")
async def access_shared_doc(
    token: str,
) -> DocResponse:
    """
    Access a document via a shareable link token.
    This endpoint is public and does not require authentication.
    """
    try:
        link = await ShareableLink.get(token=token).prefetch_related("doc")
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found or expired",
        )

    if link.is_expired():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This share link has expired",
        )

    # Record the access
    await link.record_access()

    doc = link.doc
    children = doc.children.filter(public=True)

    return DocResponse(
        id=doc.id,
        parent_id=doc.parent_id,
        title=doc.title,
        slug=doc.slug,
        urlpath=doc.urlpath,
        markdown="",
        html=doc.html,
        public=doc.public,
        metadata=doc.metadata,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        updated_by_id=None,
        parents=[
            DocInfo(
                id=parent.id,
                urlpath=parent.urlpath,
                title=parent.title,
            )
            async for parent in doc.parents()
        ],
        children=[
            DocInfo(
                id=child.id,
                urlpath=child.urlpath,
                title=child.title,
            )
            async for child in children
        ],
    )
