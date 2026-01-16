from pydantic import BaseModel


class SiteConfig(BaseModel):
    site_name: str
    primary_color: str
    secondary_color: str
    primary_color_dark: str
    secondary_color_dark: str


class SiteConfigUpdate(BaseModel):
    site_name: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    primary_color_dark: str | None = None
    secondary_color_dark: str | None = None
