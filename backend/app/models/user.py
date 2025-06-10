from tortoise import Model, fields

from ..schemas.role import Role
from .utils import TimestampMixin


class User(Model, TimestampMixin):
    """
    Model representing a user in the system.
    """

    id = fields.IntField(primary_key=True)
    username = fields.CharField(max_length=50, unique=True)
    password_hash = fields.CharField(max_length=1024)
    role = fields.IntEnumField(Role, default=Role.USER)

    class Meta:  # type: ignore
        table = "users"
        ordering = ["username"]
