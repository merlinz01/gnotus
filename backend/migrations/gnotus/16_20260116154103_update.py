from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "settings" (
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" VARCHAR(50) NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
) /* Model representing a system setting. */;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "settings";"""


MODELS_STATE = (
    "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"
    "mLQIYvYr0zEV9ci0+Mj0Qa9dPv0PprVGog=="
)
