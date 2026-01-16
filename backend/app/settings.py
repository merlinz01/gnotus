# Settings for the application

import os
import secrets
from pathlib import Path
from typing import Literal

import yaml
from pydantic import Field, FilePath, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

_secrets_dir = os.environ.get("GNOTUS_SECRETS_DIR")
if _secrets_dir:
    secrets_dir = _secrets_dir.split(os.pathsep)  # pragma: no cover
else:
    secrets_dir = []


class Settings(BaseSettings):
    """
    Application settings.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="GNOTUS_",
        nested_model_default_partial_update=True,
        secrets_dir=secrets_dir,
    )

    # Database
    db_url: str = "sqlite://./gnotus.db"

    # Logging
    log_level: Literal["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"] = "INFO"

    # Site URL
    base_url: str = "http://localhost"

    # CORS
    cors_origins: list[str] = []

    # Session
    session_secret_key: SecretStr = Field(
        default_factory=lambda: SecretStr(secrets.token_urlsafe(32))
    )
    session_cookie: str = "__Secure-session"
    session_max_age: int = 60 * 60 * 24 * 7  # 7 days
    session_same_site: Literal["lax", "strict", "none"] = "strict"
    session_https_only: bool = True

    # CSRF
    csrf_secret_key: SecretStr = Field(
        default_factory=lambda: SecretStr(secrets.token_urlsafe(32))
    )
    csrf_cookie_domain: str | None = None
    csrf_cookie_samesite: Literal["lax", "strict", "none"] = "strict"

    # Indexing
    disable_search: bool = False
    meilisearch_url: str = "http://localhost:7700"
    meilisearch_api_key: SecretStr = Field(
        default_factory=lambda: SecretStr("changeme")
    )
    meilisearch_index_name: str = "docs"

    # Uploads
    uploads_dir: Path = Path("./uploads")
    max_upload_size: int = 10 * 1024 * 1024  # 10 MB
    max_upload_filename_length: int = 64
    allowed_upload_filename_extensions: list[str] = [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "bmp",
        "webp",
        "mp4",
        "pdf",
        "txt",
    ]

    # Icon uploads
    allowed_icon_extensions: list[str] = [
        "svg",
        "png",
        "jpg",
        "jpeg",
        "ico",
        "webp",
        "gif",
    ]
    max_icon_size: int = 512 * 1024  # 512 KB

    # Site config
    icon_file_path: FilePath


config_file = os.environ.get("GNOTUS_CONFIG_FILE", "")
if config_file:
    with open(config_file, "r") as f:
        config = yaml.safe_load(f)
else:
    config = {}

# Since we can't set a default for FilePath in Pydantic, set it here
config.setdefault("icon_file_path", "./icon.svg")

settings = Settings(**config)

# Trim the base URL to ensure it does not end with a slash
if settings.base_url.endswith("/"):  # pragma: no cover
    settings.base_url = settings.base_url.rstrip("/")

TORTOISE_ORM = {
    "connections": {
        "default": settings.db_url,
    },
    "apps": {
        "gnotus": {
            "models": ["app.models", "aerich.models"],
            "default_connection": "default",
        }
    },
}
