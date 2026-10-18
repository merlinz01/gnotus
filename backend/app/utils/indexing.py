import html
from dataclasses import dataclass
from datetime import datetime

import httpx2
import nh3
from bs4 import BeautifulSoup
from meilisearch_python_sdk import AsyncClient
from meilisearch_python_sdk.errors import (
    MeilisearchApiError,
    MeilisearchError,
    MeilisearchTaskFailedError,
    MeilisearchTimeoutError,
)
from meilisearch_python_sdk.models.search import SearchResults
from meilisearch_python_sdk.models.settings import (
    MeilisearchSettings,
    MinWordSizeForTypos,
    Pagination,
    TypoTolerance,
)

from ..models.doc import Doc
from ..schemas.doc import DocIndexSchema, DocSearchResult
from ..settings import settings

index_settings = MeilisearchSettings(
    searchable_attributes=["title", "text", "urlpath"],
    displayed_attributes=["id", "title", "urlpath", "text", "public"],
    stop_words=[
        "the",
        "and",
        "is",
        "to",
        "a",
        "of",
        "in",
        "for",
        "on",
        "with",
        "as",
        "that",
        "by",
    ],
    ranking_rules=[
        "typo",
        "words",
        "proximity",
        "attribute",
        "exactness",
    ],
    filterable_attributes=["public"],
    typo_tolerance=TypoTolerance(
        enabled=True,
        min_word_size_for_typos=MinWordSizeForTypos(
            one_typo=5,
            two_typos=10,
        ),
    ),
    pagination=Pagination(
        max_total_hits=1000,
    ),
)


# How long to wait for Meilisearch to report the status of the index, in seconds
STATUS_TIMEOUT = 5

# How long to wait for a full reindex to finish before leaving it to run on its own
REINDEX_WAIT_MS = 30_000


def get_meilisearch_client(timeout: int | None = None):  # pragma: no cover
    """
    Create a Meilisearch client using the configured settings.
    """
    return AsyncClient(
        url=settings.meilisearch_url,
        api_key=settings.meilisearch_api_key.get_secret_value(),
        timeout=timeout,
    )


async def create_or_update_index():  # pragma: no cover
    """
    Create the Meilisearch index if it does not exist.
    This function should be called before indexing documents.
    """
    client = get_meilisearch_client()
    try:
        index = client.index(settings.meilisearch_index_name)
        await index.update_settings(index_settings)
        return
    except MeilisearchApiError as e:
        if e.code != "index_not_found":
            raise
    await client.create_index(
        uid=settings.meilisearch_index_name,
        primary_key="id",
        settings=index_settings,
    )


async def index_all_documents() -> int:  # pragma: no cover
    """
    Replace the contents of the Meilisearch index with all documents,
    which also removes documents that were deleted while search was disabled.
    Returns the number of documents indexed.
    """
    client = get_meilisearch_client()
    index = client.index(settings.meilisearch_index_name)
    docs = [_index_schema(doc) for doc in await Doc.all()]
    # Meilisearch processes the tasks in order, so the index is only briefly empty
    task = await index.delete_all_documents()
    if docs:
        task = await index.add_documents(docs)
    # Wait for the last task, so failures are reported and the index status
    # is current afterwards, unless indexing takes long
    try:
        result = await client.wait_for_task(
            task.task_uid, timeout_in_ms=REINDEX_WAIT_MS
        )
    except MeilisearchTimeoutError:
        return len(docs)
    if result.status == "failed":
        message = (result.error or {}).get("message", "Unknown error")
        raise MeilisearchTaskFailedError(message)
    return len(docs)


@dataclass
class IndexStatus:
    """
    The state of the Meilisearch index.
    error is set when Meilisearch could not be reached or returned an error.
    configured is False when the index lacks the settings searches rely on,
    such as when it was created by indexing a document before a full reindex.
    """

    error: str | None = None
    exists: bool = False
    configured: bool = False
    document_count: int = 0
    is_indexing: bool = False
    updated_at: datetime | None = None


async def get_index_status() -> IndexStatus:  # pragma: no cover
    """
    Get the state of the Meilisearch index, without raising errors.
    """
    async with get_meilisearch_client(timeout=STATUS_TIMEOUT) as client:
        try:
            index = await client.get_index(settings.meilisearch_index_name)
            stats = await index.get_stats()
            filterable = await index.get_filterable_attributes() or []
        except MeilisearchApiError as e:
            if e.code == "index_not_found":
                return IndexStatus()
            return IndexStatus(error=str(e))
        except MeilisearchError as e:
            return IndexStatus(error=str(e))
        except httpx2.TransportError as e:
            # The client only wraps connection errors, not timeouts
            return IndexStatus(error=f"{type(e).__name__}: {e}")
    return IndexStatus(
        exists=True,
        configured=all(
            attr in filterable for attr in index_settings.filterable_attributes or []
        ),
        document_count=stats.number_of_documents,
        is_indexing=stats.is_indexing,
        updated_at=index.updated_at,
    )


def _index_schema(doc: Doc) -> dict:  # pragma: no cover
    """
    Get the representation of a document stored in the Meilisearch index.
    """
    soup = BeautifulSoup(doc.html, "html.parser")
    text = soup.get_text(separator="\n", strip=True)
    text = nh3.clean(text)
    return DocIndexSchema(
        id=str(doc.id),
        urlpath=doc.urlpath,
        title=doc.title,
        text=text,
        public=doc.public,
    ).model_dump(mode="json")


async def index_document(doc: Doc):  # pragma: no cover
    """
    Index a single document in Meilisearch.
    """
    client = get_meilisearch_client()
    index = client.index(settings.meilisearch_index_name)
    await index.update_documents([_index_schema(doc)])


async def delete_document_from_index(doc_id: int):  # pragma: no cover
    """
    Delete a document from the Meilisearch index by its ID.
    """
    client = get_meilisearch_client()
    index = client.index(settings.meilisearch_index_name)
    await index.delete_document(str(doc_id))


# Private-use characters marking highlighted search matches
_HIGHLIGHT_PRE = "\ue000"
_HIGHLIGHT_POST = "\ue001"


def _highlight_html(text: str) -> str:
    """
    Convert highlighted search result text to HTML, escaping the text itself.
    """
    text = html.escape(text)
    if text.count(_HIGHLIGHT_PRE) != text.count(_HIGHLIGHT_POST):
        return text.replace(_HIGHLIGHT_PRE, "").replace(_HIGHLIGHT_POST, "")
    return text.replace(_HIGHLIGHT_PRE, '<em class="search-highlight">').replace(
        _HIGHLIGHT_POST, "</em>"
    )


async def search_documents(
    query: str, public_only: bool = True
) -> list[DocSearchResult]:  # pragma: no cover
    """
    Search for documents in the Meilisearch index.
    Returns a list of documents matching the query.
    """
    client = get_meilisearch_client()
    index = client.index(settings.meilisearch_index_name)

    results: SearchResults[dict] = await index.search(
        query=query,
        filter=["public = true"] if public_only else [],
        limit=20,
        offset=0,
        attributes_to_retrieve=["id", "title", "urlpath", "public", "text"],
        attributes_to_crop=["text"],
        crop_length=100,
        crop_marker="...",
        attributes_to_highlight=["title", "text"],
        highlight_pre_tag=_HIGHLIGHT_PRE,
        highlight_post_tag=_HIGHLIGHT_POST,
    )
    return [
        DocSearchResult(
            id=int(result["id"]),
            title=_highlight_html(result["_formatted"]["title"]),
            urlpath=result["urlpath"],
            text=_highlight_html(result["_formatted"]["text"]),
            public=result["public"],
        )
        for result in results.hits
    ]
