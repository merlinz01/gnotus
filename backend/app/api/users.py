from logging import getLogger

from fastapi import APIRouter, HTTPException, status
from tortoise.exceptions import DoesNotExist

from ..auth.dependencies import LoggedInUser
from ..auth.passwords import check_password, hash_password
from ..models.user import User
from ..schemas.role import Role
from ..schemas.user import UserChangePassword, UserCreate, UserResponse, UserUpdate
from .pagination import PaginatedResponse, PaginationParams

logger = getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(
    current_user: LoggedInUser,
    user_create: UserCreate,
) -> UserResponse:
    """
    Create a new user.
    """
    if current_user.role != Role.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create new users",
        )
    if await User.filter(username=user_create.username).exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists",
        )
    user = await User.create(
        username=user_create.username,
        password_hash=hash_password(user_create.password),
        role=user_create.role,
    )
    logger.info(f"User {user.username} created by {current_user.username}.")
    return UserResponse.from_user(user)


@router.get("/{user_id}")
async def get_user(
    current_user: LoggedInUser,
    user_id: int,
) -> UserResponse:
    """
    Get a user by ID.
    """
    try:
        user = await User.get(id=user_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return UserResponse.from_user(user)


@router.put("/{user_id}")
async def update_user(
    current_user: LoggedInUser,
    user_id: int,
    user_update: UserUpdate,
) -> UserResponse:
    """
    Update a user by ID.
    """
    try:
        user = await User.get(id=user_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    if current_user.role != Role.ADMIN and user.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update other users",
        )
    if user_update.username is not None:
        if (
            await User.filter(username=user_update.username)
            .exclude(id=user.id)
            .exists()
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists",
            )
        user.username = user_update.username
    if user_update.role is not None:
        if current_user.role != Role.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can change user roles",
            )
        user.role = user_update.role
    await user.save()
    logger.info(f"User {user.username} updated by {current_user.username}.")
    return UserResponse.from_user(user)


@router.post("/{user_id}/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_user_password(
    current_user: LoggedInUser,
    user_id: int,
    user_change_password: UserChangePassword,
) -> None:
    """
    Change the password of a user.
    """
    try:
        user = await User.get(id=user_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    if current_user.role != Role.ADMIN and user.id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can change other users' passwords",
        )
    if user_change_password.old_password == "" and current_user.role == Role.ADMIN:
        pass  # Admins can reset passwords without providing the old password
    elif not await check_password(user, user_change_password.old_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Old password is incorrect",
        )
    user.password_hash = hash_password(user_change_password.new_password)
    await user.save(update_fields=["password_hash"])
    logger.info(
        f"Password for user {user.username} changed by {current_user.username}."
    )
    return None


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    current_user: LoggedInUser,
    user_id: int,
) -> None:
    """
    Delete a user by ID.
    """
    if current_user.role != Role.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete users",
        )
    try:
        user = await User.get(id=user_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    await user.delete()
    logger.info(f"User {user.username} deleted by {current_user.username}.")
    return None


@router.get("/")
async def list_users(
    current_user: LoggedInUser,
    pagination: PaginationParams,
) -> PaginatedResponse[UserResponse]:
    """
    List users with pagination.
    """
    users = User.all()
    total = await users.count()
    users = pagination.apply(users)

    return PaginatedResponse(
        items=[
            UserResponse(
                id=user.id,
                username=user.username,
                role=user.role,
                created_at=user.created_at,
                updated_at=user.updated_at,
            )
            async for user in users
        ],
        size=pagination.size,
        page=pagination.page,
        total=total,
    )
