import datetime
from logging import getLogger
from typing import Annotated, Literal

from fastapi import APIRouter, Body, HTTPException, status
from tortoise.exceptions import DoesNotExist
from tortoise.transactions import in_transaction

from ..auth.dependencies import LoggedInUser, OptionalUser
from ..indexing import delete_document_from_index, index_document, search_documents
from ..models.doc import Doc
from ..models.revision import Revision
from ..models.upload import Upload
from ..schemas.doc import (
    DocCreate,
    DocInfo,
    DocMetadata,
    DocResponse,
    DocSearchResponse,
    DocTreeNode,
    DocUpdate,
)
from ..schemas.revision import RevisionResponse
from ..schemas.role import Role
from ..settings import settings
from .pagination import PaginatedResponse, PaginationParams

logger = getLogger(__name__)
router = APIRouter(prefix="/docs", tags=["docs"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_doc(
    current_user: LoggedInUser,
    doc_create: DocCreate,
) -> DocResponse:
    """
    Create a new document.
    """
    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create documents",
        )
    if doc_create.parent_id is not None:
        try:
            parent = await Doc.get(id=doc_create.parent_id)
        except DoesNotExist:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent document not found",
            )
        parent_id = parent.id
    else:
        parent_id = None
    Doc.validate_urlpath(doc_create.urlpath)
    try:
        await Doc.get(urlpath=doc_create.urlpath)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A document with URL path '{doc_create.urlpath}' already exists",
        )
    except DoesNotExist:
        pass
    doc = await Doc.create(
        parent_id=parent_id,
        title=doc_create.title,
        urlpath=doc_create.urlpath,
        markdown="",
        html="",
        public=doc_create.public,
        metadata=DocMetadata().model_dump(mode="json"),
        updated_by_id=current_user.id,
    )
    await doc.save()
    if not settings.disable_search:  # pragma: no cover
        await index_document(doc)
    logger.info(f"Document '{doc.title}' created by user {current_user.username}.")
    return DocResponse(
        id=doc.id,
        parent_id=doc.parent_id,
        title=doc.title,
        urlpath=doc.urlpath,
        markdown=doc.markdown,
        html=doc.html,
        public=doc.public,
        metadata=doc.metadata,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        updated_by_id=doc.updated_by_id,
    )


@router.get("/outline")
async def get_doc_outline(
    current_user: OptionalUser,
    depth: int = 100,
) -> DocTreeNode:
    """
    Get the outline of documents as a tree structure.
    """

    async def get_children(doc_id: int | None, depth: int) -> list[DocTreeNode]:
        query = Doc.filter(parent_id=doc_id)
        if not current_user:
            query = query.filter(public=True)
        return [
            DocTreeNode(
                id=doc.id,
                title=doc.title,
                urlpath=doc.urlpath,
                public=doc.public,
                children=await get_children(doc.id, depth - 1) if depth > 0 else [],
            )
            async for doc in query
        ]

    return DocTreeNode(
        id=0,
        title="Home",
        urlpath="/",
        public=True,
        children=await get_children(None, depth - 1),
    )


@router.get("/{doc_id}")
async def get_doc(
    current_user: OptionalUser,
    doc_id: int | Literal["by_path"],
    path: str | None = None,
    include_source: bool = False,
    timestamp: datetime.datetime | None = None,
) -> DocResponse:
    """
    Get a document by ID or by URL path.
    """
    try:
        if doc_id == "by_path":
            if not path:  # pragma: no cover
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Path is required when using 'by_path'",
                )
            doc = await Doc.get(urlpath=path)
        else:
            doc = await Doc.get(id=doc_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    if not doc.public and not current_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    if timestamp and doc.updated_at == timestamp:
        raise HTTPException(
            status_code=status.HTTP_304_NOT_MODIFIED, detail="Not Modified"
        )

    children = doc.children
    if not current_user:
        children = children.filter(public=True)
    return DocResponse(
        id=doc.id,
        parent_id=doc.parent_id,
        title=doc.title,
        urlpath=doc.urlpath,
        markdown=doc.markdown if include_source else "",
        html=doc.html,
        public=doc.public,
        metadata=doc.metadata,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        updated_by_id=doc.updated_by_id if current_user else None,
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


@router.get("/{doc_id}/revisions")
async def get_doc_revisions(
    current_user: LoggedInUser,
    doc_id: int,
    pagination: PaginationParams,
) -> PaginatedResponse[RevisionResponse]:
    """
    Get all revisions of a document by ID.
    """
    try:
        doc = await Doc.get(id=doc_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view document revisions",
        )

    revisions = doc.revisions.all().prefetch_related("created_by")
    total = await revisions.count()
    revisions = pagination.apply(revisions)
    return PaginatedResponse[RevisionResponse](
        items=[
            RevisionResponse(
                id=revision.id,
                doc_id=revision.doc_id,
                markdown=revision.markdown,
                html=revision.html,
                created_by_id=revision.created_by_id,
                created_by_username=revision.created_by.username
                if revision.created_by
                else None,
                created_at=revision.created_at,
            )
            async for revision in revisions
        ],
        page=pagination.page,
        size=pagination.size,
        total=total,
    )


@router.put("/{doc_id}")
async def update_doc(
    current_user: LoggedInUser,
    doc_id: int,
    doc_update: DocUpdate,
) -> DocResponse:
    """
    Update an existing document by ID.
    """
    try:
        doc = await Doc.get(id=doc_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this document",
        )

    if doc_update.parent_id is not None:
        if doc_update.parent_id == 0:
            doc.parent = None  # type: ignore
        else:
            try:
                parent_doc = await Doc.get(id=doc_update.parent_id)
                doc.parent = parent_doc
            except DoesNotExist:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Parent document not found",
                )
            if doc.id == doc_update.parent_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot set a document as its own parent",
                )
            async for parent in parent_doc.parents():
                if parent.id == doc.id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot set a document as a child of its own descendant",
                    )
    if doc_update.title is not None:
        doc.title = doc_update.title
    if doc_update.urlpath is not None:
        Doc.validate_urlpath(doc_update.urlpath)
        doc.urlpath = doc_update.urlpath
    if doc_update.markdown is not None:
        doc.markdown = doc_update.markdown
        create_revision = True
    else:
        create_revision = False
    if doc_update.public is not None:
        doc.public = doc_update.public
    doc.updated_by_id = current_user.id
    await doc.update_content()
    async with in_transaction():
        await doc.save()
        # Sync public status to all attached uploads
        if doc_update.public is not None:
            await Upload.filter(doc_id=doc.id).update(public=doc.public)
    if create_revision:
        await Revision.create(
            doc=doc,
            markdown=doc.markdown,
            html=doc.html,
            created_by_id=current_user.id,
        )
    if not settings.disable_search:  # pragma: no cover
        await index_document(doc)
    logger.info(f"Document '{doc.title}' updated by user {current_user.username}.")
    return DocResponse(
        id=doc.id,
        parent_id=doc.parent_id,
        title=doc.title,
        urlpath=doc.urlpath,
        markdown=doc.markdown,
        html=doc.html,
        public=doc.public,
        metadata=doc.metadata,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        updated_by_id=doc.updated_by_id,
    )


@router.post("/{doc_id}/move", status_code=status.HTTP_204_NO_CONTENT)
async def move_doc(
    current_user: LoggedInUser,
    doc_id: int,
    direction: Literal["up", "down"],
) -> None:
    """
    Move a document up in the order.
    """
    try:
        doc = await Doc.get(id=doc_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this document",
        )

    if direction == "up":

        def swap(i, docs):
            if i > 0:
                docs[i - 1].order, docs[i].order = docs[i].order, docs[i - 1].order
    elif direction == "down":

        def swap(i, docs):
            if i < len(docs) - 1:
                docs[i + 1].order, docs[i].order = docs[i].order, docs[i + 1].order

    sibling_docs = await Doc.filter(parent_id=doc.parent_id)
    for i, sibling in enumerate(sibling_docs):
        sibling.order = i
    for i, sibling in enumerate(sibling_docs):
        if sibling.id == doc.id:
            swap(i, sibling_docs)
            break
    await Doc.bulk_update(sibling_docs, fields=["order"])
    logger.info(f"Document '{doc.title}' moved by user {current_user.username}.")


@router.post("/{doc_id}/restore_revision", status_code=status.HTTP_204_NO_CONTENT)
async def restore_doc_revision(
    current_user: LoggedInUser,
    doc_id: int,
    revision_id: int,
) -> None:
    """
    Restore a document to a specific revision.
    """
    try:
        doc = await Doc.get(id=doc_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this document",
        )

    try:
        revision = await Revision.get(id=revision_id, doc_id=doc_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Revision not found"
        )

    doc.markdown = revision.markdown
    doc.updated_by_id = current_user.id
    await doc.update_content()
    await doc.save()
    await Revision.create(
        doc=doc,
        markdown=doc.markdown,
        html=doc.html,
        created_by_id=current_user.id,
    )
    if not settings.disable_search:  # pragma: no cover
        await index_document(doc)
    logger.info(
        f"Document '{doc.title}' restored to revision {revision_id} by user {current_user.username}."
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_doc(
    current_user: LoggedInUser,
    doc_id: int,
) -> None:
    """
    Delete a document by ID.
    """
    try:
        doc = await Doc.get(id=doc_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this document",
        )

    await doc.delete()
    if not settings.disable_search:  # pragma: no cover
        await delete_document_from_index(doc_id)
    logger.info(f"Document '{doc.title}' deleted by user {current_user.username}.")


@router.get("/")
async def list_docs(
    current_user: LoggedInUser,
    pagination: PaginationParams,
    include_content: bool = False,
) -> PaginatedResponse[DocResponse]:
    """
    Get a list of documents with pagination.
    """
    docs = Doc.all()
    total = await docs.count()
    docs = pagination.apply(docs)

    return PaginatedResponse[DocResponse](
        items=[
            DocResponse(
                id=doc.id,
                parent_id=doc.parent_id,
                title=doc.title,
                urlpath=doc.urlpath,
                markdown=doc.markdown if include_content else "",
                html=doc.html if include_content else "",
                public=doc.public,
                metadata=doc.metadata,
                created_at=doc.created_at,
                updated_at=doc.updated_at,
                updated_by_id=doc.updated_by_id,
            )
            async for doc in docs
        ],
        page=pagination.page,
        size=pagination.size,
        total=total,
    )


@router.post("/search")
async def search_docs(
    current_user: OptionalUser,
    query: Annotated[str, Body(embed=True)],
) -> DocSearchResponse:
    """
    Search for documents based on a query string.
    """
    if settings.disable_search:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search functionality is disabled",
        )

    query = query.strip()
    if len(query) < 3:
        return DocSearchResponse(results=[], total=0)

    results = await search_documents(
        query, public_only=current_user is None
    )  # pragma: no cover
    logger.info(
        f"User {current_user.username if current_user else 'anonymous'} searched for: {query}"
    )  # pragma: no cover

    return DocSearchResponse(
        results=results,
        total=len(results),
    )  # pragma: no cover
