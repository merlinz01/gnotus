import re
import secrets

from tortoise import Model, fields

from ..settings import settings
from .utils import TimestampMixin


class Upload(Model, TimestampMixin):
    """
    Model representing an uploaded file.
    """

    id = fields.IntField(primary_key=True)
    filename = fields.CharField(max_length=256)
    content_type = fields.CharField(max_length=128)
    size = fields.IntField()
    public = fields.BooleanField(default=False)
    storage_path = fields.CharField(max_length=256, unique=True)
    created_by_id: fields.IntField
    created_by = fields.ForeignKeyField(
        "gnotus.User",
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

    def get_download_url(self) -> str:
        """
        Get the download URL for the upload.
        """
        return f"{settings.base_url}/api/uploads/{self.id}/download/{self.filename}"
