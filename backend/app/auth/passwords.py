from typing import TYPE_CHECKING

from argon2 import PasswordHasher

if TYPE_CHECKING:  # pragma: no cover
    from ..models.user import User

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Hash the provided password."""
    return _password_hasher.hash(password)


async def check_password(user: "User", password: str) -> bool:
    """Check if the provided password matches the stored hash."""
    try:
        success = _password_hasher.verify(user.password_hash, password)
        if success and _password_hasher.check_needs_rehash(
            user.password_hash
        ):  # pragma: no cover
            user.password_hash = hash_password(password)
            await user.save(update_fields=["password_hash"])
        return success
    except Exception:
        return False
