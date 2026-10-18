import re
from datetime import UTC, datetime

import pytest
from fastapi import status
from utils import TestClient

from app.models import User
from app.models.doc import Doc
from app.models.revision import Revision
from app.models.setting import Setting
from app.models.upload import Upload
from app.pages.admin import word_diff
from app.pages.rendering import format_size
from app.schemas.role import Role
from app.utils.indexing import IndexStatus


@pytest.fixture
async def doc() -> Doc:
    home = await Doc.create(
        title="Home",
        slug="",
        urlpath="/",
        public=True,
        markdown="",
        html="",
    )
    return await Doc.create(
        parent_id=home.id,
        title="Guide",
        slug="guide",
        urlpath="/guide",
        public=False,
        markdown="",
        html="",
    )


@pytest.mark.parametrize(
    "path",
    [
        "/_admin",
        "/_users",
        "/_uploads",
        "/_settings",
        "/_search-index",
        "/_revisions/1",
    ],
)
async def test_admin_pages_require_login(api_client: TestClient, path: str):
    """
    Test that anonymous users are sent to the login page.
    """
    response = api_client.get(path + "?_partial=1", follow_redirects=False)
    assert response.status_code == status.HTTP_303_SEE_OTHER
    assert response.headers["location"] == f"/_login?next={path.replace('/', '%2F')}"


@pytest.mark.parametrize(
    "path,role",
    [
        ("/_admin", Role.VIEWER),
        ("/_uploads", Role.VIEWER),
        ("/_revisions/1", Role.VIEWER),
        ("/_users", Role.USER),
        ("/_settings", Role.USER),
        ("/_search-index", Role.USER),
    ],
)
async def test_admin_pages_forbidden(api_client: TestClient, path: str, role: Role):
    """
    Test that users without the required role can't see the pages.
    """
    user = await User.create(username="someone", password_hash="x", role=role)
    api_client.set_session_user(user)
    response = api_client.get(path)
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert "You do not have permission to view this page." in response.text


async def test_admin_index(api_client: TestClient, user_admin: User, user_user: User):
    """
    Test that the administration page links to what the user may manage.
    """
    api_client.set_session_user(user_user)
    response = api_client.get("/_admin")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert 'href="/_uploads"' in response.text
    assert 'href="/_users"' not in response.text
    assert 'class="sidebar-action active"' in response.text
    api_client.set_session_user(user_admin)
    response = api_client.get("/_admin")
    assert 'href="/_users"' in response.text
    assert 'href="/_settings"' in response.text


async def test_users_page(api_client: TestClient, user_admin: User):
    """
    Test listing users with pagination.
    """
    for i in range(12):
        await User.create(username=f"user{i:02}", password_hash="x", is_active=i != 3)
    api_client.set_session_user(user_admin)
    response = api_client.get("/_users")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "Page 1 of 2 (13 items)" in html
    assert html.count('data-action="edit-user"') == 10
    assert 'data-username="admin"' in html
    assert 'data-username="user03"' in html
    assert 'class="user-inactive"' in html
    assert '<a href="?page=2&amp;size=10" class="btn btn-sm">Next</a>' in html

    response = api_client.get("/_users?page=2&size=10")
    assert "Page 2 of 2 (13 items)" in response.text
    assert response.text.count('data-action="edit-user"') == 3
    response = api_client.get("/_users?size=-1")
    assert "Page 1 of 1 (13 items)" in response.text
    assert response.text.count('data-action="edit-user"') == 13
    # Invalid parameters fall back to the defaults
    response = api_client.get("/_users?size=7&page=abc")
    assert "Page 1 of 2 (13 items)" in response.text


async def test_uploads_page(api_client: TestClient, user_user: User, doc: Doc):
    """
    Test listing uploads.
    """
    await Upload.create(
        filename="a <b>.png",
        content_type="image/png",
        size=2048,
        public=False,
        storage_path="a.png",
        doc=doc,
    )
    await Upload.create(
        filename="b.pdf",
        content_type="application/pdf",
        size=10,
        public=True,
        storage_path="b.pdf",
    )
    api_client.set_session_user(user_user)
    response = api_client.get("/_uploads")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "a &lt;b&gt;.png" in html
    assert "/download/a%20%3Cb%3E.png" in html
    assert "2.00 KB" in html
    assert "10 B" in html
    assert f'href="/_edit/{doc.id}"' in html
    assert f'<option value="{doc.id}" data-public="false">Guide</option>' in html


async def test_uploads_page_empty(api_client: TestClient, user_user: User):
    api_client.set_session_user(user_user)
    response = api_client.get("/_uploads")
    assert "No uploads found." in response.text
    assert "Page 1 of 0 (0 items)" in response.text


async def test_settings_page(api_client: TestClient, user_admin: User):
    """
    Test that the settings page shows the current configuration.
    """
    await Setting.set_value("site_name", "My Docs")
    await Setting.set_value("primary_color", "#112233")
    api_client.set_session_user(user_admin)
    response = api_client.get("/_settings")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert 'name="site_name" class="input" value="My Docs"' in html
    assert 'value="#112233"' in html
    # Only the text field may use the field name as its id, since the script
    # reads the values with form.elements[name]
    assert 'id="primary_color-picker"' in html
    assert html.count('id="primary_color"') == 1
    # There's no custom icon to revert
    assert 'data-action="revert-icon" hidden' in html
    await Setting.set_value("site_icon_upload_id", 5)
    response = api_client.get("/_settings")
    assert 'data-action="revert-icon" hidden' not in response.text


async def test_search_index_page_disabled(
    api_client: TestClient, user_admin: User, doc: Doc
):
    """
    Test that the search index page can't rebuild the index when search is disabled.
    """
    api_client.set_session_user(user_admin)
    response = api_client.get("/_admin")
    assert 'href="/_search-index"' in response.text
    response = api_client.get("/_search-index")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    # Search is disabled in the tests
    assert "Search is disabled" in html
    assert re.search(r'type="submit" class="btn btn-primary"\s+disabled', html)
    assert "search-index-stats" not in html


@pytest.mark.parametrize(
    "index_status,label,hint",
    [
        (IndexStatus(error="Connection refused"), "Unavailable", "Connection refused"),
        (IndexStatus(), "Not created", "been created yet"),
        (
            IndexStatus(exists=True, document_count=2),
            "Not set up",
            "missing settings",
        ),
        (
            IndexStatus(exists=True, configured=True, is_indexing=True),
            "Indexing",
            "processing changes",
        ),
        (
            IndexStatus(exists=True, configured=True, document_count=1),
            "Out of date",
            "number of indexed documents",
        ),
        (
            IndexStatus(
                exists=True,
                configured=True,
                document_count=2,
                updated_at=datetime(2026, 1, 2, 3, 4, tzinfo=UTC),
            ),
            "Up to date",
            None,
        ),
    ],
)
async def test_search_index_page_status(
    api_client: TestClient,
    user_admin: User,
    doc: Doc,
    monkeypatch: pytest.MonkeyPatch,
    index_status: IndexStatus,
    label: str,
    hint: str | None,
):
    """
    Test that the search index page shows the state of the index.
    """
    from app.settings import settings

    async def get_index_status() -> IndexStatus:
        return index_status

    monkeypatch.setattr("app.pages.admin.get_index_status", get_index_status)
    monkeypatch.setattr(settings, "disable_search", False)
    api_client.set_session_user(user_admin)
    response = api_client.get("/_search-index")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "Search is disabled" not in html
    assert re.search(r'type="submit" class="btn btn-primary"\s*>', html)
    assert f">{label}</span>" in html
    assert re.search(r"<dt>Documents</dt>\s*<dd>2</dd>", html)
    assert ("<dt>Indexed documents</dt>" in html) == index_status.exists
    if hint:
        assert hint in html
    else:
        assert "settings-hint" not in html
    if index_status.updated_at:
        assert 'datetime="2026-01-02T03:04:00+00:00"' in html


async def test_revisions_page(api_client: TestClient, user_user: User, doc: Doc):
    """
    Test listing revisions and viewing a revision with its changes.
    """
    first = await Revision.create(
        doc=doc, markdown="Hello world", html="<p>Hello world</p>", created_by=user_user
    )
    second = await Revision.create(
        doc=doc, markdown="Hello there world", html="<p>Hello there world</p>"
    )
    api_client.set_session_user(user_user)
    response = api_client.get(f"/_revisions/{doc.id}")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "<title>Revisions - Guide - Gnotus</title>" in html
    assert html.index(f'data-revision-id="{second.id}"') < html.index(
        f'data-revision-id="{first.id}"'
    )
    assert "<td>user</td>" in html
    assert "<td>Unknown User</td>" in html

    response = api_client.get(f"/_partial/revision/{second.id}")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert "<p>Hello there world</p>" in response.text
    assert 'Hello <span class="diff-added">there </span>world' in response.text

    response = api_client.get(f"/_partial/revision/{first.id}")
    assert "This is the first revision." in response.text
    assert "by <strong>user</strong>" in response.text


async def test_revisions_page_not_found(api_client: TestClient, user_user: User):
    api_client.set_session_user(user_user)
    response = api_client.get("/_revisions/999")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    response = api_client.get("/_revisions/abc")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "text/html" in response.headers["content-type"]
    response = api_client.get("/_partial/revision/999")
    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_revision_partial_forbidden(
    api_client: TestClient, user_viewer: User, doc: Doc
):
    revision = await Revision.create(doc=doc, markdown="Secret", html="<p>Secret</p>")
    response = api_client.get(f"/_partial/revision/{revision.id}")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    api_client.set_session_user(user_viewer)
    response = api_client.get(f"/_partial/revision/{revision.id}")
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_word_diff():
    assert word_diff("one two three", "one 2 three four") == [
        ("", "one "),
        ("removed", "two"),
        ("added", "2"),
        ("", " three"),
        ("added", " four"),
    ]
    assert word_diff("same", "same") == [("", "same")]


def test_format_size():
    assert format_size(0) == "0 B"
    assert format_size(1023) == "1023 B"
    assert format_size(1536) == "1.50 KB"
    assert format_size(5 * 1024 * 1024) == "5.00 MB"
    assert format_size(3 * 1024**4) == "3072.00 GB"
