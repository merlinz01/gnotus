import nh3
from bs4 import BeautifulSoup
from meilisearch_python_sdk import AsyncClient, AsyncIndex
from meilisearch_python_sdk.errors import MeilisearchApiError
from meilisearch_python_sdk.models.search import SearchResults
from meilisearch_python_sdk.models.settings import (
    MeilisearchSettings,
    MinWordSizeForTypos,
    Pagination,
    TypoTolerance,
)

from .models.doc import Doc
from .schemas.doc import DocIndexSchema, DocSearchResult
from .settings import settings

index_settings = MeilisearchSettings(
    searchable_attributes=["title", "text", "urlpath", "urlpathbase"],
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
        disable_on_words=["urlpathbase"],
        min_word_size_for_typos=MinWordSizeForTypos(
            one_typo=5,
            two_typos=10,
        ),
    ),
    pagination=Pagination(
        max_total_hits=1000,
    ),
)


def get_meilisearch_client():  # pragma: no cover
    """
    Create a Meilisearch client using the configured settings.
    """
    return AsyncClient(
        url=settings.meilisearch_url,
        api_key=settings.meilisearch_api_key.get_secret_value(),
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


async def index_all_documents():  # pragma: no cover
    """
    Index all documents in the Meilisearch instance.
    This function should be called after the database is populated.
    """

    client = get_meilisearch_client()
    index = client.index(settings.meilisearch_index_name)

    for doc in await Doc.all():
        await index_document(doc, index=index)


async def index_document(doc: Doc, index: AsyncIndex | None = None):  # pragma: no cover
    """
    Index a single document in Meilisearch.
    """
    soup = BeautifulSoup(doc.html, "html.parser")
    text = soup.get_text(separator="\n", strip=True)
    text = nh3.clean(text)
    doc_schema = DocIndexSchema(
        id=str(doc.id),
        urlpath=doc.urlpath,
        urlpathbase=doc.urlpath.split("/")[0],
        title=doc.title,
        text=text,
        public=doc.public,
    ).model_dump(mode="json")
    if index is None:
        client = get_meilisearch_client()
        index = client.index(settings.meilisearch_index_name)
    await index.update_documents([doc_schema])


async def delete_document_from_index(doc_id: int):  # pragma: no cover
    """
    Delete a document from the Meilisearch index by its ID.
    """
    client = get_meilisearch_client()
    index = client.index(settings.meilisearch_index_name)
    await index.delete_document(str(doc_id))


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
        highlight_pre_tag="<em class='search-highlight'>",
    )
    return [
        DocSearchResult(
            id=int(result["id"]),
            title=result["_formatted"]["title"],
            urlpath=result["urlpath"],
            text=result["_formatted"]["text"],
            public=result["public"],
        )
        for result in results.hits
    ]
