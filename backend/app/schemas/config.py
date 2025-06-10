from pydantic import BaseModel


class SiteConfig(BaseModel):
    site_name: str
    site_description: str
    primary_color: str
    secondary_color: str
