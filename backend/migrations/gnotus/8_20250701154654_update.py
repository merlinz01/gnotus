from tortoise import BaseDBAsyncClient


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "uploads" (
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "filename" VARCHAR(256) NOT NULL,
    "content_type" VARCHAR(128) NOT NULL,
    "size" INT NOT NULL,
    "public" INT NOT NULL DEFAULT 0,
    "storage_path" VARCHAR(256) NOT NULL UNIQUE,
    "created_by_id" INT REFERENCES "users" ("id") ON DELETE SET NULL
) /* Model representing an uploaded file. */;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "uploads";"""
