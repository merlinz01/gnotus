import time
from logging import getLogger

from fastapi import APIRouter, HTTPException, Request, Response, status

from ..auth.dependencies import LoggedInUser
from ..auth.passwords import check_password
from ..models.user import User
from ..schemas.auth import LoginRequest, LoginResponse
from ..schemas.user import UserResponse

logger = getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(
    request: Request,
    response: Response,
    login_request: LoginRequest,
) -> LoginResponse:
    """
    Log in a user with username and password.
    If the user is already logged in, return the current user's information.
    """
    start = time.monotonic()
    try:
        user = await User.get(username=login_request.username)
        if not user.is_active:
            raise ValueError("User account is deactivated")
        if not await check_password(user, login_request.password):
            raise ValueError("Invalid password")
        request.session.clear()
        request.session["user_id"] = user.id
        logger.info(f"User {user.username} logged in successfully.")
        response.delete_cookie("csrftoken")
        return LoginResponse(user=UserResponse.from_user(user))
    except Exception as e:
        logger.error(f"Login failed for user {login_request.username}: {e}")
        time.sleep(max(0, 1.0 - (time.monotonic() - start)))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        ) from e


@router.get("/user")
async def get_current_user(
    request: Request,
    current_user: LoggedInUser,
) -> UserResponse:
    """
    Get the currently logged-in user's information.
    """
    return UserResponse.from_user(current_user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response) -> None:
    """
    Log out the current user.
    """
    logger.info(f"User {request.session.get('user_id')} logged out.")
    request.session.clear()
    response.delete_cookie("csrftoken")
    return None
