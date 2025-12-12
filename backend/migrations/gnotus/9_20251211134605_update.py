from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "shareable_links" (
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "token" VARCHAR(64) NOT NULL UNIQUE,
    "expires_at" TIMESTAMP,
    "last_accessed_at" TIMESTAMP,
    "access_count" INT NOT NULL DEFAULT 0,
    "created_by_id" INT REFERENCES "users" ("id") ON DELETE SET NULL,
    "doc_id" INT NOT NULL REFERENCES "docs" ("id") ON DELETE CASCADE
) /* Model representing a shareable link for a document. */;
CREATE INDEX IF NOT EXISTS "idx_shareable_l_token_1b28b0" ON "shareable_links" ("token");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "shareable_links";"""


MODELS_STATE = (
    "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"
)
