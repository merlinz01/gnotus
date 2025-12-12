import datetime
from typing import Literal

from pydantic import BaseModel


class ShareLinkCreate(BaseModel):
    """
    Model for creating a shareable link.
    """

    doc_id: int
    expiration: Literal["7days", "30days", "never"] | None = "7days"


class ShareLinkResponse(BaseModel):
    """
    Model for shareable link response data.
    """

    id: int
    token: str
    doc_id: int
    created_by_id: int | None
    expires_at: datetime.datetime | None
    last_accessed_at: datetime.datetime | None
    access_count: int
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ShareLinkPublicInfo(BaseModel):
    """
    Minimal public information about a shareable link (for access validation).
    """

    doc_id: int
    is_expired: bool
