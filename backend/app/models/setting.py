import json
from typing import Any

from tortoise import fields

from .utils import TimestampedModel


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
