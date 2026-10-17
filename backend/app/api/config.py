import aiofiles
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from tortoise.exceptions import DoesNotExist

from ..auth.dependencies import LoggedInUser
from ..models.setting import Setting, get_site_config, get_site_icon
from ..models.upload import Upload
from ..schemas.config import SiteConfig, SiteConfigUpdate
from ..settings import settings

router = APIRouter()


@router.put("/config")
async def update_config(
    current_user: LoggedInUser,
    config_update: SiteConfigUpdate,
) -> SiteConfig:
    """
    Update the site configuration. Requires admin role.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update site configuration",
        )
    if config_update.site_name is not None:
        await Setting.set_value("site_name", config_update.site_name)
    if config_update.primary_color is not None:
        await Setting.set_value("primary_color", config_update.primary_color)
    if config_update.secondary_color is not None:
        await Setting.set_value("secondary_color", config_update.secondary_color)
    if config_update.primary_color_dark is not None:
        await Setting.set_value("primary_color_dark", config_update.primary_color_dark)
    if config_update.secondary_color_dark is not None:
        await Setting.set_value(
            "secondary_color_dark", config_update.secondary_color_dark
        )
    return await get_site_config()


@router.get("/icon", response_class=FileResponse)
async def get_icon() -> FileResponse:
    """
    Get the site icon. Returns custom icon if configured, otherwise default.
    """
    path, media_type = await get_site_icon()
    # Without this, browsers cache the icon heuristically and keep showing
    # the old one after it is changed, until a hard reload
    return FileResponse(
        path=path, media_type=media_type, headers={"Cache-Control": "no-cache"}
    )


async def _delete_old_icon() -> None:
    """Delete the current custom icon upload if one exists."""
    old_icon_id = await Setting.get_value("site_icon_upload_id", None)
    if old_icon_id:
        try:
            old_upload = await Upload.get(id=old_icon_id)
            await old_upload.delete()
            filepath = settings.uploads_dir / old_upload.storage_path
            filepath.unlink(missing_ok=True)
        except DoesNotExist:
            pass


@router.post("/icon", status_code=status.HTTP_201_CREATED)
async def upload_icon(
    current_user: LoggedInUser,
    file: UploadFile = File(...),
) -> dict:
    """
    Upload a custom site icon. Requires admin role.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can upload site icon",
        )

    # Delete old icon if exists
    await _delete_old_icon()

    # Validate file extension
    filename = Upload.sanitize_filename(file.filename or "icon")
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in settings.allowed_icon_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{extension}' is not allowed. "
            f"Allowed: {', '.join(settings.allowed_icon_extensions)}",
        )

    # Validate content type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )

    # Read and validate file size
    content = await file.read()
    if len(content) > settings.max_icon_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Icon size exceeds maximum of {settings.max_icon_size // 1024}KB",
        )

    # Store the file
    storage_path = Upload.generate_storage_path() + "." + extension
    filepath = settings.uploads_dir / storage_path
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)

    # Create upload record
    upload = await Upload.create(
        filename=f"site-icon.{extension}",
        content_type=file.content_type,
        size=len(content),
        public=True,
        storage_path=storage_path,
        created_by=current_user,
        doc=None,
    )

    # Update site config to use this icon
    await Setting.set_value("site_icon_upload_id", upload.id)

    return {
        "id": upload.id,
        "content_type": upload.content_type,
        "size": upload.size,
    }


@router.delete("/icon", status_code=status.HTTP_204_NO_CONTENT)
async def delete_icon(current_user: LoggedInUser) -> None:
    """
    Remove custom site icon and revert to default. Requires admin role.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete site icon",
        )

    # Delete the upload file and record
    await _delete_old_icon()

    # Remove the setting
    setting = await Setting.get_or_none(key="site_icon_upload_id")
    if setting:
        await setting.delete()
