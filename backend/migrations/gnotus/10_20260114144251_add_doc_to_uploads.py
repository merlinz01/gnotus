from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "uploads" ADD "doc_id" INT REFERENCES "docs" ("id") ON DELETE SET NULL;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "uploads" DROP COLUMN "doc_id";"""


MODELS_STATE = (
    "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"
    "zP42ZcREf5pSzfaDT1OWCEA3v7w8/g+G4Vq0"
)
