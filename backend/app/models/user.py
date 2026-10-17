from tortoise import fields

from ..schemas.role import ADMIN_ROLES, EDITOR_ROLES, Role
from .utils import TimestampedModel


class User(TimestampedModel):
    """
    Model representing a user in the system.
    """

    id = fields.IntField(primary_key=True)
    username = fields.CharField(max_length=50, unique=True)
    password_hash = fields.CharField(max_length=1024)
    role = fields.IntEnumField(Role, default=Role.USER)
    is_active = fields.BooleanField(default=True)

    class Meta:
        table = "users"
        ordering = ["username"]

    @property
    def is_admin(self) -> bool:
        return self.role in ADMIN_ROLES

    @property
    def can_edit(self) -> bool:
        return self.role in EDITOR_ROLES
