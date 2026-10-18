from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "docs" ADD "subtitles" JSON NOT NULL DEFAULT '[]';
        UPDATE "docs" SET "subtitles" = COALESCE(JSON_EXTRACT("metadata", '$.subtitles'), '[]');
        ALTER TABLE "docs" DROP COLUMN "metadata";"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "docs" ADD "metadata" JSON NOT NULL DEFAULT '{}';
        UPDATE "docs" SET "metadata" = JSON_OBJECT('subtitles', JSON("subtitles"));
        ALTER TABLE "docs" DROP COLUMN "subtitles";"""


MODELS_STATE = (
    "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"
    "6lZZbv7ObuZ/3s8vF/FY28Hg=="
)
