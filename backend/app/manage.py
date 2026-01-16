import asyncio
import functools

import click


@click.group()
def cli() -> None:
    """Manage the application."""
    pass


def async_command(func):
    """Decorator to make a function asynchronous."""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        return asyncio.run(func(*args, **kwargs))

    return wrapper


def with_tortoise(func):
    """Decorator to ensure Tortoise ORM is initialized before running the command."""

    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        from tortoise import Tortoise

        from .settings import TORTOISE_ORM

        await Tortoise.init(config=TORTOISE_ORM)
        try:
            return await func(*args, **kwargs)
        finally:
            await Tortoise.close_connections()

    return wrapper


@cli.command()
@click.option("--admin", is_flag=True, prompt=True, help="Create an admin user.")
@click.option("--username", prompt=True, help="Username for the new user.")
@click.option(
    "--password",
    prompt=True,
    hide_input=True,
    confirmation_prompt=True,
    help="Password for the new user.",
)
@async_command
@with_tortoise
async def create_user(admin: bool, username: str, password: str) -> None:
    """Create a new user."""
    from .auth.passwords import hash_password
    from .models.user import User
    from .schemas.role import Role

    user = await User.create(
        username=username,
        password_hash=hash_password(password),
        role=Role.ADMIN if admin else Role.USER,
    )
    print(f"User created: {user.username}")


@cli.command()
@click.option("--dir", "output_dir", help="Directory to output Markdown files.")
@click.option("--zip", "zip_path", help="Zip file path to output Markdown files.")
@click.option(
    "--single-file", "single_file", help="Single Markdown file for LLM consumption."
)
@click.option("--revisions", is_flag=True, help="Include revisions in the dump.")
@click.option("--public", is_flag=True, help="Only dump public documents.")
@click.option("--attachments", is_flag=True, help="Include attachments in the dump.")
@async_command
@with_tortoise
async def dump(
    output_dir: str | None,
    zip_path: str | None,
    single_file: str | None,
    revisions: bool,
    public: bool,
    attachments: bool,
) -> None:
    """Dump the database to Markdown files."""
    options = [output_dir, zip_path, single_file]
    if sum(1 for opt in options if opt) > 1:
        raise click.UsageError(
            "Cannot specify more than one of --dir, --zip, or --single-file."
        )
    if single_file and (attachments or revisions):
        raise click.UsageError(
            "--attachments and --revisions are not supported with --single-file."
        )
    if single_file:
        from .utils.dump import dump_to_single_file

        await dump_to_single_file(single_file, public_only=public)
        print(f"Database dumped to {single_file}.")
    elif zip_path:
        from .utils.dump import dump_to_zip

        await dump_to_zip(
            zip_path,
            include_revisions=revisions,
            public_only=public,
            include_attachments=attachments,
        )
        print(f"Database dumped to {zip_path}.")
    elif output_dir:
        from .utils.dump import dump_to_dir

        await dump_to_dir(
            output_dir,
            include_revisions=revisions,
            public_only=public,
            include_attachments=attachments,
        )
        print(f"Database dumped to {output_dir}.")
    else:
        raise click.UsageError("Must specify one of --dir, --zip, or --single-file.")


@cli.command()
@async_command
@with_tortoise
async def index() -> None:
    """Index all documents."""
    from .utils.indexing import create_or_update_index, index_all_documents

    await create_or_update_index()
    await index_all_documents()
    print("Documents indexed successfully.")


if __name__ == "__main__":
    cli()
