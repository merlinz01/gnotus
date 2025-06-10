from tortoise import BaseDBAsyncClient


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "users" (
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "username" VARCHAR(50) NOT NULL UNIQUE,
    "password_hash" VARCHAR(1024) NOT NULL,
    "role" SMALLINT NOT NULL DEFAULT 1 /* USER: 1\nADMIN: 2\nVIEWER: 3 */
) /* Model representing a user in the system. */;
CREATE TABLE IF NOT EXISTS "docs" (
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "urlpath" VARCHAR(255) NOT NULL UNIQUE,
    "public" INT NOT NULL DEFAULT 0,
    "metadata" JSON NOT NULL,
    "markdown" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "order" INT NOT NULL DEFAULT 0,
    "parent_id" INT REFERENCES "docs" ("id") ON DELETE CASCADE,
    "updated_by_id" INT REFERENCES "users" ("id") ON DELETE SET NULL
) /* Model representing a document. */;
CREATE TABLE IF NOT EXISTS "revisions" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "markdown" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" INT REFERENCES "users" ("id") ON DELETE SET NULL,
    "doc_id" INT NOT NULL REFERENCES "docs" ("id") ON DELETE CASCADE
) /* Model representing a revision of a document. */;
CREATE TABLE IF NOT EXISTS "aerich" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "version" VARCHAR(255) NOT NULL,
    "app" VARCHAR(100) NOT NULL,
    "content" JSON NOT NULL
);"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        """
