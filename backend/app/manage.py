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
@click.option("--dir", prompt=True, help="Directory to output Markdown dump.")
@click.option("--revisions", is_flag=True, help="Include revisions in the dump.")
@async_command
@with_tortoise
async def dump(dir: str, revisions: bool) -> None:
    """Dump the database to Markdown files."""
    from .dump import dump_to_markdown

    await dump_to_markdown(dir, include_revisions=revisions)
    print(f"Database dumped to {dir}.")


@cli.command()
@async_command
@with_tortoise
async def index() -> None:
    """Index all documents."""
    from .indexing import create_or_update_index, index_all_documents

    await create_or_update_index()
    await index_all_documents()
    print("Documents indexed successfully.")


if __name__ == "__main__":
    cli()
