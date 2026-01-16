from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from ..auth.dependencies import LoggedInUser
from ..models.setting import Setting
from ..models.user import Role
from ..schemas.config import SiteConfig, SiteConfigUpdate
from ..settings import settings

router = APIRouter()


@router.get("/config.json")
async def get_config() -> SiteConfig:
    """
    Get the site configuration.
    """
    return SiteConfig(
        site_name=await Setting.get_value("site_name", "Gnotus"),
        primary_color=await Setting.get_value("primary_color", "#4A90E2"),
        secondary_color=await Setting.get_value("secondary_color", "#50E3C2"),
        primary_color_dark=await Setting.get_value("primary_color_dark", "#4A90E2"),
        secondary_color_dark=await Setting.get_value("secondary_color_dark", "#50E3C2"),
    )


@router.put("/config.json")
async def update_config(
    current_user: LoggedInUser,
    config_update: SiteConfigUpdate,
) -> SiteConfig:
    """
    Update the site configuration. Requires admin role.
    """
    if current_user.role != Role.ADMIN:
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
    return await get_config()


@router.get("/icon.svg", response_class=FileResponse)
async def get_icon():
    """
    Get the site icon.
    """
    return settings.icon_file_path
