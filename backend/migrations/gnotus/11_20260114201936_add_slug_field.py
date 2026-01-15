from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    # First, add the slug column with a default
    await db.execute_query(
        'ALTER TABLE "docs" ADD "slug" VARCHAR(100) NOT NULL DEFAULT \'\''
    )

    # Fetch all docs and update their slugs
    rows = await db.execute_query('SELECT "id", "urlpath" FROM "docs"')
    for row in rows[1]:
        doc_id = row[0]
        urlpath = row[1]
        # Extract slug as the last segment of urlpath
        slug = urlpath.split("/")[-1] if urlpath else ""
        await db.execute_query(
            'UPDATE "docs" SET "slug" = ? WHERE "id" = ?',
            [slug, doc_id],
        )

    return ""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "docs" DROP COLUMN "slug";"""


MODELS_STATE = (
    "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"
)
