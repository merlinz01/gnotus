import sys

from pytest import MonkeyPatch


def test_load_settings(monkeypatch: MonkeyPatch):
    """
    Sanity check to ensure settings can be loaded.
    """
    sys.modules.pop("app.settings", None)
    monkeypatch.delenv("GNOTUS_MEILISEARCH_API_KEY", raising=False)

    from app.settings import settings

    assert settings.meilisearch_api_key.get_secret_value() == "changeme"


def test_settings_from_environment(monkeypatch: MonkeyPatch):
    """
    Test that settings can be overridden by environment variables.
    """
    sys.modules.pop("app.settings", None)
    monkeypatch.setenv("GNOTUS_LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("GNOTUS_ALLOWED_UPLOAD_FILENAME_EXTENSIONS", '["png", "pdf"]')

    from app.settings import settings

    assert settings.log_level == "DEBUG"
    assert settings.allowed_upload_filename_extensions == ["png", "pdf"]
