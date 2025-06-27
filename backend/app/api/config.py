from fastapi import APIRouter
from fastapi.responses import FileResponse

from ..schemas.config import SiteConfig
from ..settings import settings

router = APIRouter()


@router.get("/config.json")
async def get_config() -> SiteConfig:
    """
    Get the site configuration.
    """
    return SiteConfig(
        site_name=settings.site_name,
        site_description=settings.site_description,
        primary_color=settings.primary_color,
        secondary_color=settings.secondary_color,
        primary_color_dark=settings.primary_color_dark or settings.primary_color,
        secondary_color_dark=settings.secondary_color_dark or settings.secondary_color,
    )


@router.get("/icon.svg", response_class=FileResponse)
async def get_icon():
    """
    Get the site icon.
    """
    return settings.icon_file_path
