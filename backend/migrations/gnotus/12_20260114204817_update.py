from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE UNIQUE INDEX "uid_docs_parent__f589ab" ON "docs" ("parent_id", "slug");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP INDEX IF EXISTS "uid_docs_parent__f589ab";"""


MODELS_STATE = (
    "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"
    "//A7lnx8Q="
)
