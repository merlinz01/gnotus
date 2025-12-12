import secrets
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from tortoise import fields

from .utils import TimestampedModel

if TYPE_CHECKING:  # pragma: no cover
    from .doc import Doc
    from .user import User


class ShareableLink(TimestampedModel):
    """
    Model representing a shareable link for a document.
    """

    id = fields.IntField(primary_key=True)
    token = fields.CharField(max_length=64, unique=True, index=True)
    doc_id: int
    doc: fields.ForeignKeyRelation["Doc"] = fields.ForeignKeyField(
        "gnotus.Doc", related_name="shareable_links", on_delete=fields.CASCADE
    )
    created_by_id: int | None
    created_by: fields.ForeignKeyNullableRelation["User"] = fields.ForeignKeyField(
        "gnotus.User", null=True, on_delete=fields.SET_NULL
    )
    expires_at = fields.DatetimeField(null=True)
    last_accessed_at = fields.DatetimeField(null=True)
    access_count = fields.IntField(default=0)

    class Meta:  # type: ignore
        table = "shareable_links"
        ordering = ["-created_at"]

    @staticmethod
    def generate_token() -> str:
        """
        Generate a cryptographically secure token for the shareable link.
        Uses 32 bytes (256 bits) of randomness for security.
        """
        return secrets.token_urlsafe(32)

    def is_expired(self) -> bool:
        """
        Check if the shareable link has expired.
        """
        if self.expires_at is None:
            return False
        return datetime.now(timezone.utc) > self.expires_at

    async def record_access(self) -> None:
        """
        Record an access to this shareable link.
        Updates last_accessed_at and increments access_count.
        """
        self.last_accessed_at = datetime.now(timezone.utc)
        self.access_count += 1
        await self.save(update_fields=["last_accessed_at", "access_count"])
