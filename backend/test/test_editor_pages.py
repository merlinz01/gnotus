import pytest
from fastapi import status
from utils import TestClient

from app.models import User
from app.models.doc import Doc
from app.models.upload import Upload


@pytest.fixture
async def docs() -> dict[str, Doc]:
    home = await Doc.create(
        title="Home",
        slug="",
        urlpath="/",
        public=True,
        metadata={},
        markdown="Welcome",
        html="<p>Welcome</p>",
    )
    guide = await Doc.create(
        parent_id=home.id,
        title="Guide",
        slug="guide",
        urlpath="/guide",
        public=False,
        metadata={},
        markdown="\nStarts with a blank line & <b>",
        html="<p>Starts with a blank line &amp; &lt;b&gt;</p>",
    )
    child = await Doc.create(
        parent_id=guide.id,
        title="Child",
        slug="child",
        urlpath="/guide/child",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    other = await Doc.create(
        parent_id=home.id,
        title="Other",
        slug="other",
        urlpath="/other",
        public=True,
        metadata={},
        markdown="",
        html="",
    )
    return {"home": home, "guide": guide, "child": child, "other": other}


@pytest.mark.parametrize("path", ["/_new", "/_edit/1"])
async def test_editor_pages_require_editor(
    api_client: TestClient, user_viewer: User, path: str
):
    response = api_client.get(path, follow_redirects=False)
    assert response.status_code == status.HTTP_303_SEE_OTHER
    api_client.set_session_user(user_viewer)
    response = api_client.get(path)
    assert response.status_code == status.HTTP_403_FORBIDDEN


async def test_new_doc_page(
    api_client: TestClient, user_user: User, docs: dict[str, Doc]
):
    """
    Test the new document page, with the parent preselected.
    """
    api_client.set_session_user(user_user)
    response = api_client.get(f"/_new?parent={docs['guide'].id}")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert '<meta name="gnotus-cache" content="no" data-page-meta>' in html
    assert (
        f'<option value="{docs["guide"].id}" data-public="false" selected>'
        "   Guide</option>" in html
    )
    # Children are indented under their parents
    assert " " * 6 + "Child</option>" in html
    assert f'<option value="{docs["home"].id}" data-public="true">Home</option>' in html


async def test_edit_doc_page(
    api_client: TestClient, user_user: User, docs: dict[str, Doc]
):
    """
    Test the editor for a document.
    """
    await Upload.create(
        filename="pic.png",
        content_type="image/png",
        size=1,
        public=False,
        storage_path="pic.png",
        doc=docs["guide"],
    )
    api_client.set_session_user(user_user)
    response = api_client.get(f"/_edit/{docs['guide'].id}")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "<title>Editing Guide - Gnotus</title>" in html
    assert '<meta name="gnotus-cache" content="no" data-page-meta>' in html
    # The Markdown is escaped, and its leading newline survives the HTML parser
    assert ">\n\nStarts with a blank line &amp; &lt;b&gt;</textarea>" in html
    # The current preview is the document's HTML
    assert "<p>Starts with a blank line &amp; &lt;b&gt;</p>" in html
    assert 'value="guide"' in html
    assert "data-home" not in html
    assert 'data-action="move-doc"' in html
    # The document can't be moved under itself or its descendants
    assert f'<option value="{docs["guide"].id}"' not in html
    assert f'<option value="{docs["child"].id}"' not in html
    assert (
        f'<option value="{docs["home"].id}" data-public="true" selected>Home</option>'
        in html
    )
    assert f'<option value="{docs["other"].id}"' in html
    assert "Attachments (1)" in html
    assert 'data-filename="pic.png"' in html
    assert 'data-image="true"' in html


async def test_edit_home_page(
    api_client: TestClient, user_user: User, docs: dict[str, Doc]
):
    """
    Test that the home page can't be moved, renamed or deleted.
    """
    api_client.set_session_user(user_user)
    response = api_client.get(f"/_edit/{docs['home'].id}")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "data-home" in html
    assert 'name="slug"' not in html
    assert 'name="parent_id"' not in html
    assert 'data-action="move-doc"' not in html
    assert 'data-action="delete-doc"' not in html


async def test_new_doc_page_invalid_parent(
    api_client: TestClient, user_user: User, docs: dict[str, Doc]
):
    """
    Test that an invalid parent ID is ignored instead of failing validation.
    """
    api_client.set_session_user(user_user)
    response = api_client.get("/_new?parent=abc")
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.text
    assert "disabled selected>Select a parent document</option>" in html
    assert html.count(" selected>") == 1


@pytest.mark.parametrize("path", ["/_edit/999", "/_edit/abc"])
async def test_edit_doc_page_not_found(
    api_client: TestClient, user_user: User, path: str
):
    api_client.set_session_user(user_user)
    response = api_client.get(path)
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "text/html" in response.headers["content-type"]


async def test_attachments_partial(
    api_client: TestClient, user_user: User, user_viewer: User, docs: dict[str, Doc]
):
    response = api_client.get(f"/_partial/attachments/{docs['guide'].id}")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    api_client.set_session_user(user_viewer)
    response = api_client.get(f"/_partial/attachments/{docs['guide'].id}")
    assert response.status_code == status.HTTP_403_FORBIDDEN
    api_client.set_session_user(user_user)
    response = api_client.get(f"/_partial/attachments/{docs['guide'].id}")
    assert response.status_code == status.HTTP_200_OK
    assert "Attachments (0)" in response.text
    assert "No attachments yet." in response.text


async def test_preview(api_client: TestClient, user_user: User, user_viewer: User):
    """
    Test previewing Markdown, rendered and sanitized like document content.
    """
    body = {"markdown": "# Title\n\n<script>alert(1)</script>Hi"}
    response = api_client.post("/api/docs/preview", json=body)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    api_client.set_session_user(user_viewer)
    response = api_client.post("/api/docs/preview", json=body)
    assert response.status_code == status.HTTP_403_FORBIDDEN
    api_client.set_session_user(user_user)
    response = api_client.post("/api/docs/preview", json=body)
    assert response.status_code == status.HTTP_200_OK, response.text
    html = response.json()["html"]
    assert '<h1 id="section-title">Title<a class="heading-anchor"' in html
    assert "<script>" not in html
