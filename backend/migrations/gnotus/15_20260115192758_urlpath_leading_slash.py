from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        UPDATE "docs" SET "urlpath" = '/' || "urlpath" WHERE "urlpath" NOT LIKE '/%';
        UPDATE "docs" SET "urlpath" = '/' WHERE "parent_id" IS NULL;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        UPDATE "docs" SET "urlpath" = '' WHERE "parent_id" IS NULL;
        UPDATE "docs" SET "urlpath" = SUBSTR("urlpath", 2) WHERE "urlpath" LIKE '/%';"""


MODELS_STATE = (
    "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"
    "Mi"
)
