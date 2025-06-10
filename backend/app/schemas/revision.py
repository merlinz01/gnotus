import datetime

from pydantic import BaseModel


class RevisionBase(BaseModel):
    """
    Base model for revision data.
    """

    doc_id: int
    markdown: str
    html: str
    created_by_id: int | None
    created_at: datetime.datetime


class RevisionResponse(RevisionBase):
    """
    Response model for a revision.
    """

    id: int
    created_by_username: str | None
