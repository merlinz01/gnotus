from datetime import datetime

from fastapi import UploadFile
from pydantic import BaseModel, Field


class UploadBase(BaseModel):
    """
    Base model for upload data.
    """

    filename: str
    content_type: str
    size: int
    public: bool


class UploadCreate(BaseModel):
    """
    Model for creating a new upload.
    """

    file: UploadFile
    filename: str = Field(min_length=3, max_length=255)
    public: bool


class UploadUpdate(BaseModel):
    """
    Model for updating an existing upload.
    """

    filename: str | None = Field(min_length=3, max_length=255, default=None)
    public: bool | None = None


class UploadResponse(UploadBase):
    """
    Model for the response of an upload.
    """

    id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    download_url: str
