from pydantic import BaseModel

from ..schemas.user import UserResponse


class LoginRequest(BaseModel):
    """
    Model for login request data.
    """

    username: str
    password: str


class LoginResponse(BaseModel):
    """
    Model for login response data.
    """

    user: UserResponse
