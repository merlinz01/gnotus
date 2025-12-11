from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "users" ADD "is_active" INT NOT NULL DEFAULT 1;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "users" DROP COLUMN "is_active";"""


MODELS_STATE = (
    "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"
    "SPWtbVzY+t/aFsi1Nr+8PP0PES/V0Q=="
)
