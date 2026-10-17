import json
from pathlib import Path
from typing import Any

from tortoise import fields

from ..schemas.config import SiteConfig
from ..settings import settings
from .upload import Upload
from .utils import TimestampedModel

_DEFAULT_CONFIG: dict[str, Any] = {
    "site_name": "Gnotus",
    "primary_color": "#4A90E2",
    "secondary_color": "#50E3C2",
    "primary_color_dark": "#4A90E2",
    "secondary_color_dark": "#50E3C2",
    "site_icon_upload_id": None,
}


class Setting(TimestampedModel):
    """
    Model representing a system setting.
    """

    key = fields.CharField(max_length=50, primary_key=True)
    value = fields.TextField()

    class Meta:
        table = "settings"
        ordering = ["key"]

    @classmethod
    async def get_value(cls, key: str, default: Any = None) -> Any:
        """
        Get the value of the setting by key.
        """
        setting = await cls.get_or_none(key=key)
        if setting is None:
            return default
        return json.loads(setting.value)

    @classmethod
    async def set_value(cls, key: str, value: Any) -> None:
        """
        Set the value of the setting by key.
        """
        await cls.update_or_create(key=key, defaults={"value": json.dumps(value)})


async def get_site_config() -> SiteConfig:
    """
    Get the site configuration, with defaults for the settings that aren't set.
    """
    values = dict(_DEFAULT_CONFIG)
    async for setting in Setting.filter(key__in=list(_DEFAULT_CONFIG)):
        values[setting.key] = json.loads(setting.value)
    return SiteConfig(**values)


async def get_site_icon() -> tuple[Path, str]:
    """
    Get the path and media type of the site icon: the custom icon if there is
    one, otherwise the default.
    """
    icon_upload_id = await Setting.get_value("site_icon_upload_id", None)
    if icon_upload_id:
        upload = await Upload.get_or_none(id=icon_upload_id)
        # The custom icon may have been deleted
        if upload is not None:
            return settings.uploads_dir / upload.storage_path, upload.content_type
    return settings.icon_file_path, "image/svg+xml"
