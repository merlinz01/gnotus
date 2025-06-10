from typing import TYPE_CHECKING

from tortoise import Model, fields

if TYPE_CHECKING:  # pragma: no cover
    from .doc import Doc
    from .user import User


class Revision(Model):
    """
    Model representing a revision of a document.
    """

    id = fields.IntField(primary_key=True)
    doc_id: int
    doc: fields.ForeignKeyRelation["Doc"] = fields.ForeignKeyField(
        "gnotus.Doc", related_name="revisions", on_delete=fields.CASCADE
    )
    markdown = fields.TextField()
    html = fields.TextField()
    created_by_id: int | None
    created_by: fields.ForeignKeyNullableRelation["User"] = fields.ForeignKeyField(
        "gnotus.User", null=True, on_delete=fields.SET_NULL
    )
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:  # type: ignore
        table = "revisions"
        ordering = ["-created_at"]
