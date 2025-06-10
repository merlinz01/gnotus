from typing import Annotated, TypeAlias

from fastapi import Depends, HTTPException, Request, status

from ..models.user import User


async def UserDependency(request: Request) -> User | None:
    """
    Dependency to get the user from the request.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    return await User.get_or_none(id=user_id)


OptionalUser: TypeAlias = Annotated[User | None, Depends(UserDependency)]


async def LoggedInUserDependency(user: OptionalUser) -> User:
    """
    Dependency to ensure the user is logged in.
    Raises HTTPException if the user is not logged in.
    """
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return user


LoggedInUser: TypeAlias = Annotated[User, Depends(LoggedInUserDependency)]
