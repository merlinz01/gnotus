from pathlib import Path

from app.models.upload import Upload
from app.models.user import User
from fastapi import status
from utils import TestClient


async def test_create_upload(
    api_client: TestClient, user_admin: User, uploads_dir: Path
):
    """
    Test creating a new upload.
    """
    from app.settings import settings

    api_client.set_session_user(user_admin)
    print(f"Uploads directory set to: {settings.uploads_dir}")
    print(f"Temporary path: {uploads_dir}")
    response = api_client.post(
        "/api/uploads/",
        data={
            "filename": "newupload.png",
            "public": "true",
        },
        files={
            "file": ("newupload.png", b"fake file content", "image/png"),
        },
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data == {
        "id": data["id"],
        "filename": "newupload.png",
        "content_type": "image/png",
        "size": len(b"fake file content"),
        "public": True,
        "created_by_id": user_admin.id,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "download_url": f"{settings.base_url}/api/uploads/{data['id']}/download/newupload.png",
    }
    await Upload.get(id=data["id"])


async def test_create_upload_unauthorized(api_client: TestClient, user_viewer: User):
    """
    Test creating a new upload as a non-admin upload.
    """
    api_client.set_session_user(user_viewer)
    response = api_client.post(
        "/api/uploads/",
        data={
            "filename": "newupload.png",
            "public": "true",
        },
        files={
            "file": ("newupload.png", b"fake file content", "image/png"),
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "You do not have permission to upload files"}


async def test_create_upload_filename_too_long(
    api_client: TestClient, user_admin: User
):
    """
    Test creating a new upload with a filename that is too long.
    """
    from app.settings import settings

    api_client.set_session_user(user_admin)
    long_filename = "a" * (settings.max_upload_filename_length + 1)
    response = api_client.post(
        "/api/uploads/",
        data={
            "filename": long_filename,
            "public": "true",
        },
        files={
            "file": ("newupload.png", b"fake file content", "image/png"),
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "detail": f"Filename is too long. Maximum length is {settings.max_upload_filename_length} characters"
    }


async def test_create_upload_invalid_filename_extension(
    api_client: TestClient, user_admin: User
):
    """
    Test creating a new upload with an invalid filename extension.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/uploads/",
        data={
            "filename": "newupload.invalidext",
            "public": "true",
        },
        files={
            "file": ("newupload.invalidext", b"fake file content", "image/png"),
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"].startswith(
        "File extension 'invalidext' is not allowed. Allowed extensions are: "
    )


async def test_create_upload_missing_content_type(
    api_client: TestClient, user_admin: User
):
    """
    Test creating a new upload with a missing content type.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/uploads/",
        data={
            "filename": "newupload.png",
            "public": "true",
        },
        files={
            "file": ("newupload.png", b"fake file content", ""),
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"detail": "Content type is required"}


async def test_create_upload_mismatched_content_type(
    api_client: TestClient, user_admin: User
):
    """
    Test creating a new upload with a mismatched content type.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/uploads/",
        data={
            "filename": "newupload.png",
            "public": "true",
        },
        files={
            "file": ("newupload.png", b"fake file content", "text/plain"),
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "detail": "Content type mismatch: expected 'image/png' for file 'newupload.png'"
    }


async def test_create_upload_exceeds_max_size(api_client: TestClient, user_admin: User):
    """
    Test creating a new upload that exceeds the maximum size limit.
    """
    from app.settings import settings

    api_client.set_session_user(user_admin)
    large_content = b"x" * (settings.max_upload_size + 1)  # Exceed max size
    response = api_client.post(
        "/api/uploads/",
        data={
            "filename": "largeupload.png",
            "public": "true",
        },
        files={
            "file": ("largeupload.png", large_content, "image/png"),
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "detail": f"File size exceeds the maximum limit of {settings.max_upload_size / (1024 * 1024)} MB"
    }


async def test_get_upload(api_client: TestClient, user_admin: User):
    """
    Test getting a upload by ID.
    """
    from app.settings import settings

    api_client.set_session_user(user_admin)
    upload = await Upload.create(
        filename="testupload.png",
        content_type="image/png",
        size=1024,
        public=True,
        created_by=user_admin,
        storage_path="",
    )
    response = api_client.get(f"/api/uploads/{upload.id}")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data == {
        "id": upload.id,
        "filename": "testupload.png",
        "content_type": "image/png",
        "size": 1024,
        "public": True,
        "created_by_id": user_admin.id,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "download_url": f"{settings.base_url}/api/uploads/{upload.id}/download/testupload.png",
    }


async def test_get_upload_not_found(api_client: TestClient, user_admin: User):
    """
    Test getting a upload that does not exist.
    """
    api_client.set_session_user(user_admin)
    response = api_client.get("/api/uploads/9999")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Upload not found"}


async def test_download_upload(
    api_client: TestClient, user_admin: User, tmp_path: Path
):
    """
    Test downloading a upload by ID.
    """
    from app.settings import settings

    settings.uploads_dir = tmp_path
    api_client.set_session_user(user_admin)
    imgpath = tmp_path / "testupload.png"
    imgpath.write_bytes(b"fake image content")
    upload = await Upload.create(
        filename="testupload.png",
        content_type="image/png",
        size=len(b"fake image content"),
        public=True,
        created_by=user_admin,
        storage_path=str(imgpath),
    )
    response = api_client.get(f"/api/uploads/{upload.id}/download/testupload.png")
    assert response.status_code == status.HTTP_200_OK
    assert response.headers["Content-Type"] == "image/png"
    assert (
        response.headers["Content-Disposition"]
        == 'attachment; filename="testupload.png"'
    )
    assert response.content == b"fake image content"


async def test_download_upload_not_found(api_client: TestClient, user_admin: User):
    """
    Test downloading a upload that does not exist.
    """
    api_client.set_session_user(user_admin)
    response = api_client.get("/api/uploads/9999/download/testupload.png")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Upload not found"}


async def test_download_private_upload_unauthorized(api_client: TestClient):
    """
    Test downloading a private upload not logged in.
    """
    upload = await Upload.create(
        filename="privateupload.png",
        content_type="image/png",
        size=1024,
        public=False,
        created_by=None,
        storage_path="",
    )
    response = api_client.get(f"/api/uploads/{upload.id}/download/privateupload.png")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Upload not found"}


async def test_download_upload_wrong_filename(api_client: TestClient, user_admin: User):
    """
    Test downloading a upload with a wrong filename.
    """
    api_client.set_session_user(user_admin)
    upload = await Upload.create(
        filename="testupload.png",
        content_type="image/png",
        size=1024,
        public=True,
        created_by=user_admin,
        storage_path="",
    )
    response = api_client.get(f"/api/uploads/{upload.id}/download/wrongname.png")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"detail": "Incorrect filename"}


async def test_update_upload(api_client: TestClient, user_admin: User):
    """
    Test updating a upload by ID.
    """
    api_client.set_session_user(user_admin)
    upload = await Upload.create(
        filename="testupload.png",
        content_type="image/png",
        size=1024,
        public=True,
        created_by=user_admin,
        storage_path="",
    )
    response = api_client.put(
        f"/api/uploads/{upload.id}",
        json={
            "filename": "updatedupload.png",
            "public": False,
        },
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == upload.id
    assert data["filename"] == "updatedupload.png"
    assert data["public"] is False
    await upload.refresh_from_db()
    assert upload.filename == "updatedupload.png"
    assert upload.public is False


async def test_update_upload_unauthorized(
    api_client: TestClient,
    user_viewer: User,
):
    """
    Test updating a upload as a non-admin upload.
    """
    api_client.set_session_user(user_viewer)
    upload = await Upload.create(
        filename="testupload.png",
        content_type="image/png",
        size=1024,
        public=True,
        created_by=user_viewer,
        storage_path="",
    )
    response = api_client.put(
        f"/api/uploads/{upload.id}",
        json={
            "filename": "updatedupload.png",
            "public": False,
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "You do not have permission to update uploads"}


async def test_update_upload_not_found(api_client: TestClient, user_admin: User):
    """
    Test updating a upload that does not exist.
    """
    api_client.set_session_user(user_admin)
    response = api_client.put(
        "/api/uploads/9999",
        json={
            "filename": "updatedupload.png",
            "public": False,
        },
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Upload not found"}


async def test_update_upload_filename_too_long(
    api_client: TestClient, user_admin: User
):
    """
    Test updating a upload with a filename that is too long.
    """
    from app.settings import settings

    api_client.set_session_user(user_admin)
    upload = await Upload.create(
        filename="testupload.png",
        content_type="image/png",
        size=1024,
        public=True,
        created_by=user_admin,
        storage_path="",
    )
    long_filename = "a" * (settings.max_upload_filename_length + 1)
    response = api_client.put(
        f"/api/uploads/{upload.id}",
        json={
            "filename": long_filename,
            "public": True,
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {
        "detail": f"Filename is too long. Maximum length is {settings.max_upload_filename_length} characters"
    }


async def test_update_upload_changed_filename_extension(
    api_client: TestClient, user_admin: User
):
    """
    Test updating a upload with a changed filename extension.
    """
    api_client.set_session_user(user_admin)
    upload = await Upload.create(
        filename="testupload.png",
        content_type="image/png",
        size=1024,
        public=True,
        created_by=user_admin,
        storage_path="",
    )
    response = api_client.put(
        f"/api/uploads/{upload.id}",
        json={
            "filename": "updatedupload.jpg",  # Changing extension
            "public": True,
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json() == {"detail": "File extension cannot be changed"}


async def test_delete_upload(
    api_client: TestClient, user_admin: User, uploads_dir: Path
):
    """
    Test deleting a upload by ID.
    """
    api_client.set_session_user(user_admin)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    imgpath = uploads_dir / "testupload.png"
    imgpath.write_bytes(b"fake image content")
    upload = await Upload.create(
        filename="testupload.png",
        content_type="image/png",
        size=1024,
        public=True,
        created_by=user_admin,
        storage_path="testupload.png",
    )
    response = api_client.delete(f"/api/uploads/{upload.id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert await Upload.get_or_none(id=upload.id) is None
    print(imgpath)
    assert not imgpath.exists(), "Upload file should be deleted from storage"


async def test_delete_upload_unauthorized(api_client: TestClient, user_viewer: User):
    """
    Test deleting a upload as a non-admin upload.
    """
    api_client.set_session_user(user_viewer)
    upload = await Upload.create(
        filename="testupload.png",
        content_type="image/png",
        size=1024,
        public=True,
        created_by=user_viewer,
        storage_path="",
    )
    response = api_client.delete(f"/api/uploads/{upload.id}")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "You do not have permission to delete uploads"}


async def test_delete_upload_not_found(api_client: TestClient, user_admin: User):
    """
    Test deleting a upload that does not exist.
    """
    api_client.set_session_user(user_admin)
    response = api_client.delete("/api/uploads/9999")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Upload not found"}


async def test_list_uploads(api_client: TestClient, user_admin: User):
    """
    Test listing all uploads.
    """
    from app.settings import settings

    upload1 = await Upload.create(
        filename="upload1.png",
        content_type="image/png",
        size=1024,
        public=True,
        created_by=user_admin,
        storage_path="abc",
    )
    upload2 = await Upload.create(
        filename="upload2.png",
        content_type="image/png",
        size=2048,
        public=False,
        created_by=user_admin,
        storage_path="def",
    )
    api_client.set_session_user(user_admin)
    response = api_client.get("/api/uploads/?page=1&size=2")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data == {
        "items": [
            {
                "id": upload1.id,
                "filename": "upload1.png",
                "content_type": "image/png",
                "size": 1024,
                "public": True,
                "created_by_id": user_admin.id,
                "created_at": data["items"][0]["created_at"],
                "updated_at": data["items"][0]["updated_at"],
                "download_url": f"{settings.base_url}/api/uploads/{upload1.id}/download/upload1.png",
            },
            {
                "id": upload2.id,
                "filename": "upload2.png",
                "content_type": "image/png",
                "size": 2048,
                "public": False,
                "created_by_id": user_admin.id,
                "created_at": data["items"][1]["created_at"],
                "updated_at": data["items"][1]["updated_at"],
                "download_url": f"{settings.base_url}/api/uploads/{upload2.id}/download/upload2.png",
            },
        ],
        "size": 2,
        "page": 1,
        "total": 2,
    }
