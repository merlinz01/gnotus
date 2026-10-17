import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel
from pydantic_core import PydanticCustomError

# Hex colors with 3, 4, 6 or 8 digits
_HEX_COLOR_RE = re.compile(r"#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})")


def _validate_color(value: str) -> str:
    if not _HEX_COLOR_RE.fullmatch(value):
        raise PydanticCustomError(
            "color",
            "{value} is not a hex color such as #4A90E2",
            {"value": repr(value)},
        )
    return value


Color = Annotated[str, AfterValidator(_validate_color)]


class SiteConfig(BaseModel):
    site_name: str
    primary_color: str
    secondary_color: str
    primary_color_dark: str
    secondary_color_dark: str
    site_icon_upload_id: int | None = None


class SiteConfigUpdate(BaseModel):
    site_name: str | None = None
    primary_color: Color | None = None
    secondary_color: Color | None = None
    primary_color_dark: Color | None = None
    secondary_color_dark: Color | None = None
