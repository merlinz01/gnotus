import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:  # pragma: no cover
    from ..models.user import User

from .role import Role

USERNAME_MIN_LENGTH = 3
PASSWORD_MIN_LENGTH = 8


class UserBase(BaseModel):
    """
    Base model for user data.
    """

    username: str
    role: Role
    is_active: bool = True


class UserCreate(UserBase):
    """
    Model for creating a new user.
    """

    username: str = Field(min_length=USERNAME_MIN_LENGTH)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH)
    is_active: bool = True


class UserUpdate(BaseModel):
    """
    Model for updating an existing user.
    """

    username: str | None = Field(min_length=USERNAME_MIN_LENGTH, default=None)
    role: Role | None = None
    is_active: bool | None = None


class UserResponse(UserBase):
    """
    Model for user response data.
    """

    id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime
    is_active: bool = True

    @classmethod
    def from_user(cls, user: "User") -> "UserResponse":
        """
        Create a UserResponse from a User model instance.
        """
        return cls(
            id=user.id,
            username=user.username,
            role=user.role,
            created_at=user.created_at,
            updated_at=user.updated_at,
            is_active=user.is_active,
        )


class UserChangePassword(BaseModel):
    """
    Model for changing user password.
    """

    old_password: str
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH)
