from pydantic import BaseModel


class SiteConfig(BaseModel):
    site_name: str
    primary_color: str
    secondary_color: str
    primary_color_dark: str
    secondary_color_dark: str
    site_icon_upload_id: int | None = None


class SiteConfigUpdate(BaseModel):
    site_name: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    primary_color_dark: str | None = None
    secondary_color_dark: str | None = None
    site_icon_upload_id: int | None = None
