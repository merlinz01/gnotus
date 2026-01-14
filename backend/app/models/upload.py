import re
import secrets
from typing import TYPE_CHECKING

from tortoise import fields

from .utils import TimestampedModel

if TYPE_CHECKING:
    from .doc import Doc


class Upload(TimestampedModel):
    """
    Model representing an uploaded file.
    """

    id = fields.IntField(primary_key=True)
    filename = fields.CharField(max_length=256)
    content_type = fields.CharField(max_length=128)
    size = fields.IntField()
    public = fields.BooleanField(default=False)
    storage_path = fields.CharField(max_length=256, unique=True)
    created_by_id: int | None
    created_by = fields.ForeignKeyField(
        "gnotus.User",
        related_name="uploads",
        on_delete=fields.SET_NULL,
        null=True,
    )
    doc_id: int | None
    doc: fields.ForeignKeyNullableRelation["Doc"] = fields.ForeignKeyField(
        "gnotus.Doc",
        related_name="uploads",
        on_delete=fields.SET_NULL,
        null=True,
    )

    class Meta:  # type: ignore
        table = "uploads"
        ordering = ["filename", "created_at"]

    @staticmethod
    def generate_storage_path() -> str:
        """
        Generate a unique storage path for the upload.
        """
        return secrets.token_hex(16)

    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """
        Sanitize the filename.
        """
        return re.sub(r"[^\w\-_.]+", "-", filename)
