from enum import IntEnum


class Role(IntEnum):
    USER = 1
    ADMIN = 2
    VIEWER = 3


# Roles that may edit documents and manage uploads and share links
EDITOR_ROLES = frozenset({Role.ADMIN, Role.USER})
# Roles that may manage users and site settings
ADMIN_ROLES = frozenset({Role.ADMIN})
