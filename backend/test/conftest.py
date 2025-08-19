import os
import sys

import pytest
from pytest import TempPathFactory
from utils import TestClient

os.environ["GNOTUS_DB_URL"] = "sqlite://:memory:"
os.environ["GNOTUS_DISABLE_SEARCH"] = "1"

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope="session")
def api_client():
    """
    Fixture to create a test client for the API.
    """
    from app.main import app

    client = TestClient(app)
    with client:
        yield client


@pytest.fixture(scope="function", autouse=True)
async def reset_db(api_client):
    """
    Fixture to reset the database before each test.
    """
    from app.settings import TORTOISE_ORM
    from tortoise import Tortoise

    await Tortoise._drop_databases()
    await Tortoise.init(config=TORTOISE_ORM)
    await Tortoise.generate_schemas()

    yield

    await Tortoise.close_connections()


@pytest.fixture(scope="function", autouse=True)
async def cookies(api_client: TestClient):
    """
    Fixture to set up cookies before each test.
    """
    from starlette_csrf.middleware import CSRFMiddleware

    api_client.cookies.clear()
    # Set up CSRF token
    csrftoken = None
    middleware = api_client.app.middleware_stack  # type: ignore
    while middleware:
        if isinstance(middleware, CSRFMiddleware):
            csrftoken = middleware._generate_csrf_token()
            break
        middleware = middleware.app
    if csrftoken is None:
        raise RuntimeError("CSRFMiddleware not found in the middleware stack.")
    api_client.cookies.set(
        name="csrftoken",
        value=csrftoken,
        path="/",
    )
    api_client.headers["x-csrftoken"] = csrftoken
    yield
    api_client.cookies.clear()


@pytest.fixture
async def user_admin_with_password(api_client):
    """
    Fixture to create an admin user for the tests with a hashed password.
    """
    from app.auth.passwords import hash_password
    from app.models import User
    from app.schemas.role import Role

    user = await User.create(
        username="admin",
        password_hash=hash_password("admin_password"),
        role=Role.ADMIN,
    )
    return user


@pytest.fixture
async def user_user_with_password(api_client):
    """
    Fixture to create a regular user for the tests with a hashed password.
    """
    from app.auth.passwords import hash_password
    from app.models import User
    from app.schemas.role import Role

    user = await User.create(
        username="user",
        password_hash=hash_password("user_password"),
        role=Role.USER,
    )
    return user


@pytest.fixture
async def user_viewer_with_password(api_client):
    """
    Fixture to create a viewer user for the tests with a hashed password.
    """
    from app.auth.passwords import hash_password
    from app.models import User
    from app.schemas.role import Role

    user = await User.create(
        username="viewer",
        password_hash=hash_password("viewer_password"),
        role=Role.VIEWER,
    )
    return user


@pytest.fixture
async def user_admin(api_client):
    """
    Fixture to create an admin user for the tests with a hashed password.
    """
    from app.models import User
    from app.schemas.role import Role

    user = await User.create(
        username="admin",
        password_hash="admin_password",
        role=Role.ADMIN,
    )
    return user


@pytest.fixture
async def user_user(api_client):
    """
    Fixture to create a regular user for the tests.
    """
    from app.models import User
    from app.schemas.role import Role

    user = await User.create(
        username="user",
        password_hash="user_password",
        role=Role.USER,
    )
    return user


@pytest.fixture
async def user_viewer(api_client):
    """
    Fixture to create a viewer user for the tests.
    """
    from app.models import User
    from app.schemas.role import Role

    user = await User.create(
        username="viewer",
        password_hash="viewer_password",
        role=Role.VIEWER,
    )
    return user


@pytest.fixture(autouse=True, scope="session")
def uploads_dir(tmp_path_factory: TempPathFactory):
    """
    Fixture to set the uploads directory to a temporary path.
    """
    from app.settings import settings

    settings.uploads_dir = tmp_path_factory.mktemp("uploads")
    return settings.uploads_dir
