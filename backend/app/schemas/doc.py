import datetime

from pydantic import BaseModel


class DocBase(BaseModel):
    """
    Base model for document data.
    """

    parent_id: int | None
    title: str
    slug: str
    public: bool


class DocCreate(DocBase):
    """
    Model for creating a new document.
    """

    parent_id: int
    public: bool = False


class DocUpdate(BaseModel):
    """
    Model for updating an existing document.
    """

    parent_id: int | None = None
    title: str | None = None
    slug: str | None = None
    markdown: str | None = None
    public: bool | None = None


class DocResponse(DocBase):
    """
    Model for document response data.
    """

    id: int
    urlpath: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    updated_by_id: int | None
    markdown: str
    html: str
    metadata: dict


class DocSubtitle(BaseModel):
    """
    Model for document subtitle information.
    """

    title: str
    hash: str


class DocMetadata(BaseModel):
    """
    Model for document metadata.
    """

    subtitles: list[DocSubtitle] = []


class DocPreview(BaseModel):
    """
    Model for rendered Markdown previews.
    """

    html: str


class DocSearchResult(BaseModel):
    """
    Model for search results of documents.
    """

    id: int
    title: str
    urlpath: str
    text: str
    public: bool


class DocSearchResponse(BaseModel):
    """
    Model for the response of a document search.
    """

    total: int
    results: list[DocSearchResult] = []


class DocReindexResponse(BaseModel):
    """
    Model for the response of rebuilding the search index.
    """

    indexed: int


class DocIndexSchema(BaseModel):
    """
    Schema for indexing documents in Meilisearch.
    """

    id: str
    urlpath: str
    title: str
    text: str
    public: bool
