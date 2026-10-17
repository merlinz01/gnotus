import re
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import status
from utils import TestClient

from app.models import User
from app.models.doc import Doc
from app.models.setting import Setting
from app.models.sharelink import ShareableLink
from app.settings import settings


def outline_version(html: str) -> str:
    match = re.search(
        r'(?:data-outline-version|name="gnotus-outline-version" content)="(\w+)"', html
    )
    assert match, html
    return match.group(1)


@pytest.fixture
async def docs() -> dict[str, Doc]:
    """
    Fixture to create a small document tree.
    """
    home = await Doc.create(
        title="Home",
        slug="",
        urlpath="/",
        public=True,
        metadata={},
        markdown="",
        html="<p>Welcome to the docs</p>",
    )
    guide = await Doc.create(
        parent_id=home.id,
        title="Guide <b>",
        slug="guide",
        urlpath="/guide",
        public=True,
        metadata={"subtitles": [{"title": "Intro", "hash": "section-intro"}]},
        markdown="",
        html='<h2 id="section-intro">Intro</h2><p>Hello world</p>',
    )
    public_child = await Doc.create(
        parent_id=guide.id,
        title="Public Child",
        slug="public-child",
        urlpath="/guide/public-child",
        public=True,
        metadata={},
        markdown="",
        html="<p>Public child</p>",
    )
    private_child = await Doc.create(
        parent_id=guide.id,
        title="Private Child",
        slug="private-child",
        urlpath="/guide/private-child",
        public=False,
        metadata={},
        markdown="",
        html="<p>Secret</p>",
    )
    return {
        "home": home,
        "guide": guide,
        "public_child": public_child,
        "private_child": private_child,
    }


async def test_doc_page(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test rendering a full document page.
    """
    response = api_client.get("/guide")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert response.headers["cache-control"] == "private, no-cache"
    assert response.headers["etag"]
    html = response.text
    # Titles are escaped, while the document content is not
    assert "<title>Guide &lt;b&gt; - Gnotus</title>" in html
    assert '<h2 id="section-intro">Intro</h2>' in html
    # The page includes the layout, table of contents and breadcrumbs
    assert 'id="sidebar"' in html
    assert '<a href="#section-intro">Intro</a>' in html
    assert '<li><a href="/">Home</a></li>' in html
    assert (
        f'<link rel="canonical" href="{settings.base_url}/guide" data-page-meta>'
        in html
    )
    assert 'content="Intro Hello world" data-page-meta' in html
    assert 'name="gnotus-partial-etag" content="&#34;' in html
    assert "/_static/gnotus.css?v=" in html
    assert "/_static/app.js?v=" in html
    # Public docs are indexable
    assert 'name="robots"' not in html


async def test_doc_page_summary(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test that the summary is stored when the content changes, and computed once
    for documents saved before summaries were stored.
    """
    guide = docs["guide"]
    assert guide.summary is None
    response = api_client.get("/guide")
    assert 'content="Intro Hello world" data-page-meta' in response.text
    await guide.refresh_from_db()
    assert guide.summary == "Intro Hello world"

    guide.markdown = "New *content*"
    await guide.update_content()
    assert guide.summary == "New content"
    await guide.save()
    response = api_client.get("/guide")
    assert 'content="New content" data-page-meta' in response.text


async def test_doc_page_partial(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test rendering a document page as a partial.
    """
    response = api_client.get("/guide?_partial=1")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.headers["x-gnotus-partial"] == "1"
    assert response.headers["x-robots-tag"] == "noindex"
    html = response.text
    assert "<title>Guide &lt;b&gt; - Gnotus</title>" in html
    assert '<main id="main">' in html
    assert '<meta name="gnotus-user" content="">' in html
    assert 'name="gnotus-outline-version"' in html
    assert '<h2 id="section-intro">Intro</h2>' in html
    assert 'id="sidebar"' not in html
    assert "/_static/app.js" not in html


async def test_doc_page_partial_etag_matches_full_page(
    api_client: TestClient, docs: dict[str, Doc]
):
    """
    Test that the full page advertises the ETag of its partial.
    """
    partial = api_client.get("/guide?_partial=1")
    page = api_client.get("/guide")
    etag = partial.headers["etag"].replace('"', "&#34;")
    assert f'name="gnotus-partial-etag" content="{etag}"' in page.text


async def test_doc_page_not_modified(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test that pages are revalidated with their ETag.
    """
    response = api_client.get("/guide?_partial=1")
    etag = response.headers["etag"]
    response = api_client.get("/guide?_partial=1", headers={"If-None-Match": etag})
    assert response.status_code == status.HTTP_304_NOT_MODIFIED
    assert response.headers["etag"] == etag
    assert response.content == b""
    # Weak validators and suffixes added by compressing proxies still match
    weak = "W/" + etag[:-1] + '-gzip"'
    response = api_client.get("/guide?_partial=1", headers={"If-None-Match": weak})
    assert response.status_code == status.HTTP_304_NOT_MODIFIED


async def test_doc_page_modified(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test that the ETag changes when the document changes.
    """
    etag = api_client.get("/guide?_partial=1").headers["etag"]
    docs["guide"].html = "<p>Changed</p>"
    await docs["guide"].save()
    response = api_client.get("/guide?_partial=1", headers={"If-None-Match": etag})
    assert response.status_code == status.HTTP_200_OK
    assert "<p>Changed</p>" in response.text
    assert response.headers["etag"] != etag


async def test_doc_page_hides_private_docs(
    api_client: TestClient, docs: dict[str, Doc]
):
    """
    Test that anonymous users can't see private documents.
    """
    response = api_client.get("/guide")
    assert "Public Child" in response.text
    assert "Private Child" not in response.text
    response = api_client.get("/guide/private-child")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "Secret" not in response.text


async def test_doc_page_private_doc_logged_in(
    api_client: TestClient, docs: dict[str, Doc], user_viewer: User
):
    """
    Test that logged-in users can see private documents.
    """
    api_client.set_session_user(user_viewer)
    response = api_client.get("/guide")
    assert "Private Child" in response.text
    response = api_client.get("/guide/private-child")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert "<p>Secret</p>" in response.text
    assert '<meta name="robots" content="noindex" data-page-meta>' in response.text
    assert "Private</span>" in response.text
    assert f'data-user-id="{user_viewer.id}"' in response.text
    # Viewers can't edit
    assert f"/_edit/{docs['private_child'].id}" not in response.text
    assert 'id="share_dialog"' not in response.text


async def test_doc_page_editor_actions(
    api_client: TestClient, docs: dict[str, Doc], user_user: User
):
    """
    Test that editors get the edit actions and share dialog.
    """
    api_client.set_session_user(user_user)
    response = api_client.get("/guide")
    doc_id = docs["guide"].id
    assert f'href="/_edit/{doc_id}"' in response.text
    assert f'href="/_new?parent={doc_id}"' in response.text
    assert f'id="share_dialog" class="modal" data-doc-id="{doc_id}"' in response.text
    assert 'href="/_admin"' in response.text
    assert "Logged in as <i>user</i>" in response.text


async def test_doc_page_not_found(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test the response for a document that doesn't exist.
    """
    response = api_client.get("/does/not/exist")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "<title>Not Found - Gnotus</title>" in response.text
    assert '<meta name="robots" content="noindex" data-page-meta>' in response.text
    # Error pages aren't cached by the client
    assert '<meta name="gnotus-partial-etag" content="">' in response.text
    response = api_client.get("/does/not/exist?_partial=1")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.headers["x-gnotus-partial"] == "1"


async def test_doc_page_trailing_slash(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test that trailing slashes are redirected away.
    """
    response = api_client.get("/guide/?_partial=1", follow_redirects=False)
    assert response.status_code == status.HTTP_308_PERMANENT_REDIRECT
    assert response.headers["location"] == "/guide?_partial=1"
    # Leading slashes would make the target a URL of another site
    response = api_client.get(
        "http://testserver//evil.example/", follow_redirects=False
    )
    assert response.status_code == status.HTTP_308_PERMANENT_REDIRECT
    assert response.headers["location"] == "/evil.example"


@pytest.mark.parametrize(
    "path", ["/", "/guide", "/guide.md", "/_login", "/_admin", "/_static/app.js"]
)
async def test_head_requests(api_client: TestClient, docs: dict[str, Doc], path: str):
    """
    Test that pages answer HEAD requests with the headers of a GET request.
    """
    get = api_client.get(path, follow_redirects=False)
    head = api_client.head(path, follow_redirects=False)
    assert head.status_code == get.status_code
    assert head.headers.get("content-type") == get.headers.get("content-type")
    assert head.headers.get("location") == get.headers.get("location")
    assert head.content == b""


async def test_doc_markdown(
    api_client: TestClient, docs: dict[str, Doc], user_admin: User
):
    """
    Test that the Markdown version of a page is served at its path plus .md.
    """
    response = api_client.get("/guide.md")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.headers["content-type"] == "text/plain; charset=utf-8"
    assert response.text == ("# Guide <b>\n\n- [Public Child](/guide/public-child)\n\n")
    response = api_client.get("/guide/private-child.md")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    response = api_client.get("/missing.md")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    api_client.set_session_user(user_admin)
    response = api_client.get("/guide/private-child.md")
    assert response.status_code == status.HTTP_200_OK
    assert response.text.startswith("# Private Child\n")
    response = api_client.get("/guide.md")
    assert "- [Private Child](/guide/private-child)" in response.text


async def test_doc_page_sidebar(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test that the sidebar expands the current page and its parents.
    """
    response = api_client.get("/guide/public-child")
    html = response.text
    assert '<details class="sidebar-node" open>' in html
    assert 'class="sidebar-link sidebar-link-leaf active"' in html
    assert 'href="/_login"' in html
    response = api_client.get("/")
    assert '<details class="sidebar-node">' in response.text


async def test_home_page(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test rendering the home page.
    """
    response = api_client.get("/")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "<title>Home - Gnotus</title>" in html
    assert "<p>Welcome to the docs</p>" in html
    assert 'class="home-section-link"' in html
    assert 'href="/guide" class="home-section-link"' in html
    assert f"/_edit/{docs['home'].id}" not in html


async def test_home_page_private(
    api_client: TestClient, docs: dict[str, Doc], user_admin: User
):
    """
    Test that a private home page is only shown to logged-in users.
    """
    docs["home"].public = False
    await docs["home"].save()
    response = api_client.get("/")
    assert response.status_code == status.HTTP_200_OK
    assert "Welcome to the docs" not in response.text
    assert '<h1 class="home-title">Gnotus</h1>' in response.text
    api_client.set_session_user(user_admin)
    response = api_client.get("/")
    assert "Welcome to the docs" in response.text
    assert f"/_edit/{docs['home'].id}" in response.text


async def test_home_page_empty(api_client: TestClient):
    """
    Test the home page when there are no documents.
    """
    response = api_client.get("/")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert '<h1 class="home-title">Gnotus</h1>' in response.text


async def test_site_config(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test that the site name and colors are applied, rejecting unsafe colors.
    """
    await Setting.set_value("site_name", "My <Docs>")
    await Setting.set_value("primary_color", "#123456")
    await Setting.set_value("secondary_color", "red; background: url(x)")
    response = api_client.get("/guide")
    html = response.text
    assert "<title>Guide &lt;b&gt; - My &lt;Docs&gt;</title>" in html
    assert "--gnotus-primary: #123456" in html
    assert "--gnotus-secondary:" not in html
    assert "url(x)" not in html


async def test_sidebar_state_cookie(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test that the sidebar is rendered open according to the cookie.
    """
    assert 'data-sidebar="closed"' in api_client.get("/").text
    api_client.cookies.set("sidebar_open", "1")
    assert 'data-sidebar="open"' in api_client.get("/").text


async def test_sidebar_partial(
    api_client: TestClient, docs: dict[str, Doc], user_admin: User
):
    """
    Test fetching the sidebar on its own, and that its version changes
    when the outline changes.
    """
    response = api_client.get("/_partial/sidebar?path=/guide")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.headers["x-gnotus-partial"] == "1"
    html = response.text
    assert html.startswith('<div class="sidebar"')
    assert 'href="/guide"\n  class="sidebar-link active"' in html
    version = outline_version(api_client.get("/guide?_partial=1").text)
    assert outline_version(html) == version

    await Doc.create(
        parent_id=docs["home"].id,
        title="New Doc",
        slug="new-doc",
        urlpath="/new-doc",
        public=True,
        metadata={},
        markdown="",
        html="",
    )
    html = api_client.get("/_partial/sidebar").text
    assert "New Doc" in html
    new_version = outline_version(html)
    assert new_version != version

    # Logging in changes the sidebar too
    api_client.set_session_user(user_admin)
    html = api_client.get("/_partial/sidebar").text
    assert "Logged in as" in html
    assert outline_version(html) != new_version


async def test_shared_doc_page(
    api_client: TestClient, docs: dict[str, Doc], user_admin: User
):
    """
    Test viewing a private document through a share link.
    """
    link = await ShareableLink.create(
        token="token123",
        doc_id=docs["private_child"].id,
        created_by_id=user_admin.id,
    )
    response = api_client.get("/_share/token123")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "<p>Secret</p>" in html
    assert "Shared via link" in html
    # The public parents are shown, even though the document is private
    assert '<li><a href="/guide">Guide &lt;b&gt;</a></li>' in html
    assert '<meta name="robots" content="noindex" data-page-meta>' in html
    await link.refresh_from_db()
    assert link.access_count == 1


async def test_shared_doc_page_children(
    api_client: TestClient, docs: dict[str, Doc], user_admin: User
):
    """
    Test that a private document shared by link lists only its public children.
    """
    secret = docs["private_child"]
    for title, public in [("Open Grandchild", True), ("Hidden Grandchild", False)]:
        slug = title.lower().replace(" ", "-")
        await Doc.create(
            parent_id=secret.id,
            title=title,
            slug=slug,
            urlpath=f"{secret.urlpath}/{slug}",
            public=public,
            metadata={},
            markdown="",
            html="",
        )
    await ShareableLink.create(
        token="token123", doc_id=secret.id, created_by_id=user_admin.id
    )
    html = api_client.get("/_share/token123").text
    assert "Open Grandchild" in html
    assert "Hidden Grandchild" not in html


async def test_private_parent_hidden(
    api_client: TestClient, docs: dict[str, Doc], user_admin: User
):
    """
    Test that anonymous users don't see private parents of public documents,
    which are left out of the sidebar.
    """
    secret = docs["private_child"]
    await Doc.create(
        parent_id=secret.id,
        title="Public Grandchild",
        slug="public-grandchild",
        urlpath=f"{secret.urlpath}/public-grandchild",
        public=True,
        metadata={},
        markdown="",
        html="<p>Out in the open</p>",
    )
    response = api_client.get("/guide/private-child/public-grandchild")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "<p>Out in the open</p>" in html
    assert "Private Child" not in html
    # The page can't be reached from the home page, so it isn't in the sidebar
    assert 'href="/guide/private-child/public-grandchild"' not in html
    api_client.set_session_user(user_admin)
    html = api_client.get("/guide/private-child/public-grandchild").text
    assert '<li><a href="/guide/private-child">Private Child</a></li>' in html


async def test_private_home_page(
    api_client: TestClient, docs: dict[str, Doc], user_admin: User
):
    """
    Test that a private home page hides the outline from anonymous users.
    """
    home = docs["home"]
    home.public = False
    await home.save()
    html = api_client.get("/").text
    assert "Welcome to the docs" not in html
    assert 'href="/guide"' not in html
    # Public documents can still be visited directly
    assert api_client.get("/guide").status_code == status.HTTP_200_OK
    api_client.set_session_user(user_admin)
    html = api_client.get("/").text
    assert "Welcome to the docs" in html
    assert 'href="/guide"' in html


async def test_shared_doc_page_invalid(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test viewing an invalid share link.
    """
    response = api_client.get("/_share/nope")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "This share link is invalid or has been revoked." in response.text


async def test_shared_doc_page_expired(
    api_client: TestClient, docs: dict[str, Doc], user_admin: User
):
    """
    Test viewing an expired share link.
    """
    await ShareableLink.create(
        token="expired",
        doc_id=docs["private_child"].id,
        created_by_id=user_admin.id,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    response = api_client.get("/_share/expired")
    assert response.status_code == status.HTTP_410_GONE
    assert "This share link has expired." in response.text
    assert "Secret" not in response.text


async def test_static_assets(api_client: TestClient):
    """
    Test serving the bundled stylesheet and script.
    """
    response = api_client.get("/_static/gnotus.css")
    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == "text/css; charset=utf-8"
    assert response.headers["cache-control"] == "no-cache"
    # The imports are inlined
    assert "\n@import" not in response.text
    assert ".doc-layout" in response.text
    etag = response.headers["etag"]
    version = etag.strip('"')
    response = api_client.get(f"/_static/gnotus.css?v={version}")
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    response = api_client.get("/_static/gnotus.css", headers={"If-None-Match": etag})
    assert response.status_code == status.HTTP_304_NOT_MODIFIED

    response = api_client.get("/_static/app.js")
    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"] == "text/javascript; charset=utf-8"

    response = api_client.get("/_static/../settings.py")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    response = api_client.get("/_static/nope.css")
    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_api_paths_not_pages(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test that unknown API paths aren't handled as document pages.
    """
    response = api_client.get("/api/nope")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Not Found"}
    response = api_client.get("/_partial/nope")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Not Found"}


def test_highlight_html():
    """
    Test that search highlights are converted to HTML with the text escaped.
    """
    from app.utils.indexing import _HIGHLIGHT_POST, _HIGHLIGHT_PRE, _highlight_html

    text = f"<b>{_HIGHLIGHT_PRE}match{_HIGHLIGHT_POST}</b>"
    assert (
        _highlight_html(text)
        == '&lt;b&gt;<em class="search-highlight">match</em>&lt;/b&gt;'
    )
    assert _highlight_html(f"a {_HIGHLIGHT_PRE}b") == "a b"


def test_summarize():
    """
    Test that page descriptions leave out heading anchors and are shortened.
    """
    from app.models.doc import render_markdown
    from app.models.doc import summarize

    html, _ = render_markdown("# Intro\n\nSome text")
    assert summarize(html) == "Intro Some text"
    assert summarize("<p>one two three</p>", length=10) == "one two…"


async def test_login_page(api_client: TestClient, docs: dict[str, Doc]):
    """
    Test rendering the login page.
    """
    response = api_client.get("/_login?next=/guide")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "<title>Log in - Gnotus</title>" in html
    assert '<form class="card card-border auth-card" data-form="login">' in html
    assert '<input type="hidden" name="next" value="/guide">' in html
    assert '<meta name="robots" content="noindex" data-page-meta>' in html


@pytest.mark.parametrize(
    "next_path,expected",
    [
        (None, "/"),
        ("/guide?x=1", "/guide?x=1"),
        ("https://evil.example", "/"),
        ("//evil.example", "/"),
        ("/\\evil.example", "/"),
        ("/\t/evil.example", "/"),
        ("/\n/evil.example", "/"),
    ],
)
async def test_login_page_next(
    api_client: TestClient, user_admin: User, next_path: str | None, expected: str
):
    """
    Test that only local paths are used to return to after logging in,
    and that logged-in users are sent there right away.
    """
    params = {"next": next_path} if next_path is not None else {}
    response = api_client.get("/_login", params=params)
    assert f'name="next" value="{expected}"' in response.text
    api_client.set_session_user(user_admin)
    response = api_client.get("/_login", params=params, follow_redirects=False)
    assert response.status_code == status.HTTP_303_SEE_OTHER
    assert response.headers["location"] == expected


async def test_logout_page(api_client: TestClient, user_admin: User):
    """
    Test that the logout page only logs out when someone is logged in.
    """
    response = api_client.get("/_logout")
    assert response.status_code == status.HTTP_200_OK, response.text
    assert "You are not logged in." in response.text
    assert 'data-init="logout"' not in response.text
    api_client.set_session_user(user_admin)
    response = api_client.get("/_logout")
    assert 'data-init="logout"' in response.text
    # Visiting the page doesn't log out by itself
    assert api_client.get("/api/auth/user").status_code == status.HTTP_200_OK
