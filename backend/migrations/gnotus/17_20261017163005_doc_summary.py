from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "docs" ADD "summary" TEXT;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "docs" DROP COLUMN "summary";"""


MODELS_STATE = (
    "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"
)
