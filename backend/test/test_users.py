from app.models.user import User
from app.schemas.role import Role
from fastapi import status
from utils import TestClient


async def test_create_user(api_client: TestClient, user_admin: User):
    """
    Test creating a new user.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/users/",
        json={
            "username": "newuser",
            "password": "newpassword",
            "role": Role.USER,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data == {
        "id": data["id"],
        "username": "newuser",
        "role": Role.USER,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "is_active": True,
    }
    await User.get(id=data["id"])


async def test_create_user_unauthorized(api_client: TestClient, user_user: User):
    """
    Test creating a new user as a non-admin user.
    """
    api_client.set_session_user(user_user)
    response = api_client.post(
        "/api/users/",
        json={
            "username": "newuser",
            "password": "newpassword",
            "role": Role.USER,
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Only admins can create new users"}


async def test_create_user_username_exists(api_client: TestClient, user_admin: User):
    """
    Test creating a new user with an existing username.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/users/",
        json={
            "username": user_admin.username,
            "password": "newpassword",
            "role": Role.USER,
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"detail": "Username already exists"}


async def test_create_user_with_inactive(api_client: TestClient, user_admin: User):
    """
    Test creating a new user with is_active False.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/users/",
        json={
            "username": "inactiveuser",
            "password": "newpassword",
            "role": Role.USER,
            "is_active": False,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["is_active"] is False
    user = await User.get(id=data["id"])
    assert user.is_active is False


async def test_get_user(api_client: TestClient, user_admin: User, user_user: User):
    """
    Test getting a user by ID.
    """
    api_client.set_session_user(user_admin)
    response = api_client.get(f"/api/users/{user_user.id}")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data == {
        "id": user_user.id,
        "username": user_user.username,
        "role": user_user.role,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "is_active": user_user.is_active,
    }


async def test_get_user_not_found(api_client: TestClient, user_admin: User):
    """
    Test getting a user that does not exist.
    """
    api_client.set_session_user(user_admin)
    response = api_client.get("/api/users/9999")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "User not found"}


async def test_update_user(api_client: TestClient, user_admin: User, user_user: User):
    """
    Test updating a user by ID.
    """
    api_client.set_session_user(user_admin)
    response = api_client.put(
        f"/api/users/{user_user.id}",
        json={
            "username": "updateduser",
            "role": Role.ADMIN,
            "is_active": False,
        },
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data == {
        "id": user_user.id,
        "username": "updateduser",
        "role": Role.ADMIN,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "is_active": False,
    }
    updated_user = await User.get(id=user_user.id)
    assert updated_user.username == "updateduser"
    assert updated_user.role == Role.ADMIN


async def test_update_user_unauthorized(
    api_client: TestClient, user_user: User, user_admin: User
):
    """
    Test updating a user as a non-admin user.
    """
    api_client.set_session_user(user_user)
    response = api_client.put(
        f"/api/users/{user_admin.id}",
        json={
            "username": "updateduser",
            "role": Role.ADMIN,
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Only admins can update other users"}


async def test_update_user_not_found(api_client: TestClient, user_admin: User):
    """
    Test updating a user that does not exist.
    """
    api_client.set_session_user(user_admin)
    response = api_client.put(
        "/api/users/9999",
        json={
            "username": "updateduser",
            "role": Role.ADMIN,
        },
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "User not found"}


async def test_update_own_role_unauthorized(api_client: TestClient, user_user: User):
    """
    Test updating own role as a non-admin user.
    """
    api_client.set_session_user(user_user)
    response = api_client.put(
        f"/api/users/{user_user.id}",
        json={
            "username": user_user.username,
            "role": Role.ADMIN,
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Only admins can change user roles"}


async def test_update_username_exists(
    api_client: TestClient, user_admin: User, user_user: User
):
    """
    Test updating a user with an existing username.
    """
    api_client.set_session_user(user_admin)
    response = api_client.put(
        f"/api/users/{user_user.id}",
        json={
            "username": user_admin.username,
            "role": user_user.role,
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"detail": "Username already exists"}


async def test_update_username_unauthorized(
    api_client: TestClient, user_user: User, user_admin: User
):
    """
    Test updating other user's username as a non-admin user.
    """
    api_client.set_session_user(user_user)
    response = api_client.put(
        f"/api/users/{user_admin.id}",
        json={
            "username": "updateduser",
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Only admins can update other users"}


async def test_update_user_is_active_unauthorized(
    api_client: TestClient, user_user: User
):
    """
    Test updating a user's is_active status as a non-admin user.
    """
    api_client.set_session_user(user_user)
    response = api_client.put(
        f"/api/users/{user_user.id}",
        json={
            "is_active": False,
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Only admins can change user active status"}


async def test_delete_user(api_client: TestClient, user_admin: User, user_user: User):
    """
    Test deleting a user by ID.
    """
    api_client.set_session_user(user_admin)
    response = api_client.delete(f"/api/users/{user_user.id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT

    assert await User.get_or_none(id=user_user.id) is None


async def test_delete_user_unauthorized(
    api_client: TestClient, user_user: User, user_admin: User
):
    """
    Test deleting a user as a non-admin user.
    """
    api_client.set_session_user(user_user)
    response = api_client.delete(f"/api/users/{user_admin.id}")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Only admins can delete users"}


async def test_delete_user_not_found(api_client: TestClient, user_admin: User):
    """
    Test deleting a user that does not exist.
    """
    api_client.set_session_user(user_admin)
    response = api_client.delete("/api/users/9999")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "User not found"}


async def test_change_user_password_admin(
    api_client: TestClient, user_admin: User, user_user: User
):
    """
    Test changing a user's password.
    """
    from app.auth.passwords import check_password

    api_client.set_session_user(user_admin)
    response = api_client.post(
        f"/api/users/{user_user.id}/change-password",
        json={
            "old_password": "",
            "new_password": "newpassword123",
        },
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT, response.text

    # Verify the password change
    updated_user = await User.get(id=user_user.id)
    assert await check_password(updated_user, "newpassword123")


async def test_change_user_password_self(api_client: TestClient, user_user: User):
    """
    Test changing own password.
    """
    from app.auth.passwords import check_password

    api_client.set_session_user(user_user)
    response = api_client.post(
        f"/api/users/{user_user.id}/change-password",
        json={
            "old_password": "user_password",
            "new_password": "newpassword123",
        },
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT, response.text

    # Verify the password change
    updated_user = await User.get(id=user_user.id)
    assert await check_password(updated_user, "newpassword123")


async def test_change_user_password_unauthorized(
    api_client: TestClient, user_user: User, user_admin: User
):
    """
    Test changing another user's password as a non-admin user.
    """
    api_client.set_session_user(user_user)
    response = api_client.post(
        f"/api/users/{user_admin.id}/change-password",
        json={
            "old_password": "",
            "new_password": "newpassword123",
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {
        "detail": "Only admins can change other users' passwords"
    }


async def test_change_user_password_not_found(api_client: TestClient, user_admin: User):
    """
    Test changing a password for a user that does not exist.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/users/9999/change-password",
        json={
            "old_password": "",
            "new_password": "newpassword123",
        },
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "User not found"}


async def test_change_user_password_invalid_old_password(
    api_client: TestClient, user_user: User
):
    """
    Test changing own password with an invalid old password.
    """
    api_client.set_session_user(user_user)
    response = api_client.post(
        f"/api/users/{user_user.id}/change-password",
        json={
            "old_password": "wrongpassword",
            "new_password": "newpassword123",
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"detail": "Old password is incorrect"}


async def test_list_users(api_client: TestClient, user_admin: User, user_user: User):
    """
    Test listing all users.
    """
    user3 = await User.create(
        username="user3",
        password_hash="hashed_password3",
        role=Role.USER,
    )
    user4 = await User.create(
        username="user4",
        password_hash="hashed_password4",
        role=Role.USER,
    )
    await User.create(
        username="user5",
        password_hash="hashed_password5",
        role=Role.USER,
    )
    api_client.set_session_user(user_admin)
    response = api_client.get("/api/users/?page=2&size=2")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data == {
        "items": [
            {
                "id": user3.id,
                "username": "user3",
                "role": Role.USER,
                "created_at": data["items"][0]["created_at"],
                "updated_at": data["items"][0]["updated_at"],
                "is_active": True,
            },
            {
                "id": user4.id,
                "username": "user4",
                "role": Role.USER,
                "created_at": data["items"][1]["created_at"],
                "updated_at": data["items"][1]["updated_at"],
                "is_active": True,
            },
        ],
        "size": 2,
        "page": 2,
        "total": 5,
    }
