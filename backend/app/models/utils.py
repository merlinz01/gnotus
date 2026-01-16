from tortoise import Model, fields


class TimestampedModel(Model):
    """
    Base model with add created_at and updated_at timestamp fields.
    """

    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        abstract = True
