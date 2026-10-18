from logging import getLogger
from typing import Annotated, Literal

from fastapi import APIRouter, Body, HTTPException, status
from meilisearch_python_sdk.errors import MeilisearchError
from tortoise.exceptions import DoesNotExist
from tortoise.transactions import in_transaction

from ..auth.dependencies import LoggedInUser, OptionalUser
from ..models.doc import Doc, render_markdown
from ..models.revision import Revision
from ..models.upload import Upload
from ..schemas.doc import (
    DocCreate,
    DocMetadata,
    DocPreview,
    DocReindexResponse,
    DocResponse,
    DocSearchResponse,
    DocUpdate,
)
from ..settings import settings
from ..utils.indexing import (
    create_or_update_index,
    delete_document_from_index,
    index_all_documents,
    index_document,
    search_documents,
)

logger = getLogger(__name__)
router = APIRouter(prefix="/docs", tags=["docs"])


async def _reindex_subtree(doc: Doc) -> None:  # pragma: no cover
    """Recursively re-index a document and all its descendants."""
    await index_document(doc)
    await doc.fetch_related("children")
    for child in doc.children:
        await _reindex_subtree(child)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_doc(
    current_user: LoggedInUser,
    doc_create: DocCreate,
) -> DocResponse:
    """
    Create a new document.
    """
    if not current_user.can_edit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create documents",
        )
    try:
        parent = await Doc.get(id=doc_create.parent_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Parent document not found",
        )
    Doc.validate_slug(doc_create.slug)
    if parent.parent_id is None:
        Doc.validate_top_level_slug(doc_create.slug)
    # Check for duplicate slug among siblings
    existing = await Doc.get_or_none(parent_id=parent.id, slug=doc_create.slug)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A sibling document with slug '{doc_create.slug}' already exists",
        )
    # Compute urlpath from parent path + slug
    if parent.parent_id is None:
        urlpath = f"/{doc_create.slug}"
    else:
        urlpath = f"{parent.urlpath}/{doc_create.slug}"
    doc = await Doc.create(
        parent_id=parent.id,
        title=doc_create.title,
        slug=doc_create.slug,
        urlpath=urlpath,
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
        slug=doc.slug,
        urlpath=doc.urlpath,
        markdown=doc.markdown,
        html=doc.html,
        public=doc.public,
        metadata=doc.metadata,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        updated_by_id=doc.updated_by_id,
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

    if not current_user.can_edit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this document",
        )

    is_home_page = doc.parent_id is None
    if is_home_page and (
        doc_update.parent_id is not None or doc_update.slug is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot move or rename the home page",
        )

    needs_urlpath_update = False
    old_parent_id = doc.parent_id
    if doc_update.parent_id is not None:
        try:
            parent_doc = await Doc.get(id=doc_update.parent_id)
            doc.parent_id = parent_doc.id
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
        if doc.parent_id != old_parent_id:
            needs_urlpath_update = True
    if doc_update.title is not None:
        doc.title = doc_update.title
    if doc_update.slug is not None:
        Doc.validate_slug(doc_update.slug)
        if doc_update.slug != doc.slug:
            doc.slug = doc_update.slug
            needs_urlpath_update = True
    # Moved or renamed, so the slug must be free among the new siblings
    if needs_urlpath_update:
        if await Doc.exists(id=doc.parent_id, parent_id=None):
            Doc.validate_top_level_slug(doc.slug)
        if (
            await Doc.filter(parent_id=doc.parent_id, slug=doc.slug)
            .exclude(id=doc.id)
            .exists()
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A sibling document with slug '{doc.slug}' already exists",
            )
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
        # Update urlpath if slug or parent changed (don't index yet - do it after transaction)
        if needs_urlpath_update:
            await doc.update_urlpath(cascade=True, reindex=False)
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
    # Index after transaction commits
    if not settings.disable_search:  # pragma: no cover
        await index_document(doc)
        # Re-index children if their urlpaths changed
        if needs_urlpath_update:
            await doc.fetch_related("children")
            for child in doc.children:
                await _reindex_subtree(child)
    logger.info(f"Document '{doc.title}' updated by user {current_user.username}.")
    return DocResponse(
        id=doc.id,
        parent_id=doc.parent_id,
        title=doc.title,
        slug=doc.slug,
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

    if doc.parent_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot move the home page",
        )

    if not current_user.can_edit:
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

    if not current_user.can_edit:
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

    if doc.parent_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete the home page",
        )

    if not current_user.can_edit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this document",
        )

    await doc.delete()
    if not settings.disable_search:  # pragma: no cover
        await delete_document_from_index(doc_id)
    logger.info(f"Document '{doc.title}' deleted by user {current_user.username}.")


@router.post("/preview")
async def preview_doc(
    current_user: LoggedInUser,
    markdown: Annotated[str, Body(embed=True)],
) -> DocPreview:
    """
    Render Markdown the same way as document content, for previewing edits.
    """
    if not current_user.can_edit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit documents",
        )
    html, _ = render_markdown(markdown)
    return DocPreview(html=html)


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


@router.post("/reindex")
async def reindex_docs(current_user: LoggedInUser) -> DocReindexResponse:
    """
    Rebuild the search index from all documents. Requires admin role.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can rebuild the search index",
        )
    if settings.disable_search:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search functionality is disabled",
        )
    try:  # pragma: no cover
        await create_or_update_index()
        indexed = await index_all_documents()
    except MeilisearchError as e:  # pragma: no cover
        logger.exception("Failed to rebuild the search index")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to rebuild the search index: {e}",
        )
    logger.info(
        f"Search index rebuilt with {indexed} documents by user {current_user.username}."
    )  # pragma: no cover
    return DocReindexResponse(indexed=indexed)  # pragma: no cover
