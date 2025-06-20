import sys
from pathlib import Path

from pytest import MonkeyPatch


def test_load_settings(monkeypatch: MonkeyPatch):
    """
    Sanity check to ensure settings can be loaded.
    """
    sys.modules.pop("app.settings", None)
    monkeypatch.delenv("GNOTUS_CONFIG_FILE", raising=False)
    monkeypatch.delenv("GNOTUS_MEILISEARCH_API_KEY", raising=False)

    from app.settings import settings

    assert settings.meilisearch_api_key.get_secret_value() == "changeme"


def test_settings_file(tmp_path: Path, monkeypatch: MonkeyPatch):
    """
    Test that settings can be overridden by a config file specified in an environment variable.
    """
    sys.modules.pop("app.settings", None)

    config_file = tmp_path / "config.yml"
    monkeypatch.setenv("GNOTUS_CONFIG_FILE", str(config_file))
    with open(config_file, "w") as f:
        f.write("site_name: Overridden in config file")
    from app.settings import settings

    assert settings.site_name == "Overridden in config file"
