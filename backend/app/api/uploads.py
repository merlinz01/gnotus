import mimetypes
from logging import getLogger
from typing import Annotated

from aiofiles import open as aio_open
from fastapi import APIRouter, Form, HTTPException, status
from fastapi.responses import FileResponse
from tortoise.exceptions import DoesNotExist

from ..auth.dependencies import LoggedInUser, OptionalUser
from ..models.upload import Upload
from ..schemas.role import Role
from ..schemas.upload import UploadCreate, UploadResponse, UploadUpdate
from ..settings import settings
from .pagination import PaginatedResponse, PaginationParams

logger = getLogger(__name__)
router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_file(
    current_user: LoggedInUser,
    upload_create: Annotated[UploadCreate, Form()],
) -> UploadResponse:
    """
    Upload a file.
    """
    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to upload files",
        )

    file = upload_create.file
    file.filename = Upload.sanitize_filename(upload_create.filename or "")
    if len(file.filename) > settings.max_upload_filename_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Filename is too long. Maximum length is {settings.max_upload_filename_length} characters",
        )

    extension = file.filename.split(".")[-1].lower()
    if extension not in settings.allowed_upload_filename_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{extension}' is not allowed. Allowed extensions are: {', '.join(settings.allowed_upload_filename_extensions)}",
        )

    if not file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content type is required",
        )
    guessed = mimetypes.guess_type(file.filename)[0]
    if guessed and guessed != file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Content type mismatch: expected '{guessed}' for file '{file.filename}'",
        )

    if file.size and file.size > settings.max_upload_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds the maximum limit of {settings.max_upload_size / (1024 * 1024)} MB",
        )

    storage_path = Upload.generate_storage_path() + "." + extension
    filename = settings.uploads_dir / storage_path
    filename.unlink(missing_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    async with aio_open(filename, "wb") as out_file:
        while content := await file.read(1024 * 1024):
            await out_file.write(content)
            if await out_file.tell() > settings.max_upload_size:  # pragma: no cover
                await out_file.close()
                filename.unlink()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File size exceeds the maximum limit of {settings.max_upload_size / (1024 * 1024)} MB",
                )
        file.size = await out_file.tell()
    upload = await Upload.create(
        filename=file.filename,
        content_type=file.content_type,
        size=file.size,
        public=upload_create.public,
        storage_path=storage_path,
        created_by=current_user,
    )
    logger.info(f"File '{file.filename}' uploaded by user {current_user.id}.")

    return UploadResponse(
        filename=file.filename,
        content_type=file.content_type,
        size=file.size,
        public=upload_create.public,
        id=upload.id,
        created_by_id=upload.created_by_id,
        created_at=upload.created_at,
        updated_at=upload.updated_at,
        download_url=upload.get_download_url(),
    )


@router.get("/")
async def list_uploads(
    current_user: LoggedInUser,
    pagination: PaginationParams,
) -> PaginatedResponse[UploadResponse]:
    """
    List all uploads.
    """
    uploads = Upload.all()
    total = await uploads.count()
    uploads = pagination.apply(uploads)

    return PaginatedResponse[UploadResponse](
        items=[
            UploadResponse(
                id=upload.id,
                filename=upload.filename,
                content_type=upload.content_type,
                size=upload.size,
                public=upload.public,
                created_by_id=upload.created_by_id,
                created_at=upload.created_at,
                updated_at=upload.updated_at,
                download_url=upload.get_download_url(),
            )
            async for upload in uploads
        ],
        total=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.get("/{upload_id}")
async def get_upload(
    current_user: LoggedInUser,
    upload_id: int,
) -> UploadResponse:
    """
    Get details of a specific upload.
    """
    try:
        upload = await Upload.get(id=upload_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found",
        )

    return UploadResponse(
        id=upload.id,
        filename=upload.filename,
        content_type=upload.content_type,
        size=upload.size,
        public=upload.public,
        created_by_id=upload.created_by_id,
        created_at=upload.created_at,
        updated_at=upload.updated_at,
        download_url=upload.get_download_url(),
    )


@router.put("/{upload_id}")
async def update_upload(
    current_user: LoggedInUser,
    upload_id: int,
    upload_update: UploadUpdate,
) -> UploadResponse:
    """
    Update an existing upload.
    """
    try:
        upload = await Upload.get(id=upload_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found",
        )

    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update uploads",
        )

    if upload_update.public is not None:
        upload.public = upload_update.public
    if upload_update.filename is not None:
        upload_update.filename = Upload.sanitize_filename(upload_update.filename)
        if len(upload_update.filename) > settings.max_upload_filename_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Filename is too long. Maximum length is {settings.max_upload_filename_length} characters",
            )
        old_extension = upload.filename.split(".")[-1].lower()
        new_extension = upload_update.filename.split(".")[-1].lower()
        if old_extension != new_extension:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File extension cannot be changed",
            )
        upload.filename = upload_update.filename
    await upload.save()
    logger.info(f"Upload {upload_id} updated by user {current_user.id}.")

    return UploadResponse(
        id=upload.id,
        filename=upload.filename,
        content_type=upload.content_type,
        size=upload.size,
        public=upload.public,
        created_by_id=upload.created_by_id,
        created_at=upload.created_at,
        updated_at=upload.updated_at,
        download_url=upload.get_download_url(),
    )


@router.delete("/{upload_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(
    current_user: LoggedInUser,
    upload_id: int,
) -> None:
    """
    Delete an upload.
    """
    try:
        upload = await Upload.get(id=upload_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found",
        )

    if current_user.role != Role.ADMIN and current_user.role != Role.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete uploads",
        )

    await upload.delete()
    filename = settings.uploads_dir / upload.storage_path
    print(settings.uploads_dir, upload.storage_path, filename)
    filename.unlink(missing_ok=True)
    logger.info(f"Upload {upload_id} deleted by user {current_user.id}.")


@router.get("/{upload_id}/download")
@router.get("/{upload_id}/download/{filename}")
async def download_upload(
    current_user: OptionalUser,
    upload_id: int,
    download: bool = True,
    filename: str | None = None,
) -> FileResponse:
    """
    Download an upload.
    """
    try:
        upload = await Upload.get(id=upload_id)
    except DoesNotExist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found",
        )
    if filename and upload.filename != filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect filename",
        )

    if not upload.public and not current_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload not found",
        )

    return FileResponse(
        path=settings.uploads_dir / upload.storage_path,
        filename=upload.filename,
        media_type=upload.content_type,
        content_disposition_type="attachment" if download else "inline",
    )
