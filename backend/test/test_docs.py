from app.models import User
from app.models.doc import Doc
from app.models.revision import Revision
from fastapi import status
from utils import TestClient


async def test_create_toplevel_doc(api_client: "TestClient", user_admin: "User"):
    """
    Test creating a document.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/docs/",
        json={
            "title": "Test Document",
            "urlpath": "test/document",
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    data = response.json()
    assert data == {
        "id": data["id"],
        "title": "Test Document",
        "urlpath": "test/document",
        "parent_id": None,
        "public": False,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "updated_by_id": user_admin.id,
        "markdown": "",
        "html": "",
        "metadata": {"subtitles": []},
        "parents": [],
        "children": [],
    }
    await Doc.get(id=data["id"])


async def test_create_child_doc(api_client: "TestClient", user_admin: "User"):
    """
    Test creating a child document.
    """
    api_client.set_session_user(user_admin)
    parent = await Doc.create(
        title="Parent Document",
        urlpath="parent/document",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    response = api_client.post(
        "/api/docs/",
        json={
            "title": "Child Document",
            "urlpath": "parent/document/child",
            "parent_id": parent.id,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    data = response.json()
    assert data == {
        "id": data["id"],
        "title": "Child Document",
        "urlpath": "parent/document/child",
        "parent_id": parent.id,
        "public": False,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "updated_by_id": user_admin.id,
        "markdown": "",
        "html": "",
        "metadata": {"subtitles": []},
        "parents": [],
        "children": [],
    }
    await Doc.get(id=data["id"])


async def test_create_doc_with_invalid_parent(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test creating a document with an invalid parent ID.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/docs/",
        json={
            "title": "Invalid Parent Document",
            "urlpath": "invalid/parent/document",
            "parent_id": 9999,  # Assuming this ID does not exist
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
    data = response.json()
    assert data["detail"] == "Parent document not found"


async def test_create_doc_with_existing_urlpath(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test creating a document with an existing URL path.
    """
    api_client.set_session_user(user_admin)
    await Doc.create(
        title="Existing Document",
        urlpath="existing/document",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    response = api_client.post(
        "/api/docs/",
        json={
            "title": "Duplicate URL Document",
            "urlpath": "existing/document",  # Same URL path as existing document
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
    data = response.json()
    assert (
        data["detail"] == "A document with URL path 'existing/document' already exists"
    )


async def test_create_doc_with_invalid_urlpath(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test creating a document with an invalid URL path.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/docs/",
        json={
            "title": "Invalid URL Document",
            "urlpath": "invalid\\path",
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
    data = response.json()
    assert data["detail"] == "Invalid URL path"


async def test_create_doc_unauthorized(api_client: "TestClient", user_viewer: "User"):
    """
    Test creating a document as a user without permission.
    """
    api_client.set_session_user(user_viewer)
    response = api_client.post(
        "/api/docs/",
        json={
            "title": "Unauthorized Document",
            "urlpath": "unauthorized/document",
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN, response.text
    data = response.json()
    assert data["detail"] == "You do not have permission to create documents"


async def test_get_doc_outline(api_client: "TestClient", user_admin: "User"):
    """
    Test getting the document outline.
    """
    doc1 = await Doc.create(
        title="Outline Document 1",
        urlpath="outline/doc1",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    doc2 = await Doc.create(
        title="Outline Document 2",
        urlpath="outline/doc2",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    doc3 = await Doc.create(
        parent_id=doc1.id,
        title="Outline Document 3",
        urlpath="outline/doc3",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    doc4 = await Doc.create(
        parent_id=doc2.id,
        title="Outline Document 4",
        urlpath="outline/doc4",
        public=False,
        metadata={},
        markdown="",
        html="",
    )

    api_client.set_session_user(user_admin)
    response = api_client.get("/api/docs/outline")
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data == {
        "id": 0,
        "public": True,
        "title": "Home",
        "urlpath": "/",
        "children": [
            {
                "id": doc1.id,
                "public": False,
                "title": "Outline Document 1",
                "urlpath": "outline/doc1",
                "children": [
                    {
                        "id": doc3.id,
                        "public": False,
                        "title": "Outline Document 3",
                        "urlpath": "outline/doc3",
                        "children": [],
                    }
                ],
            },
            {
                "id": doc2.id,
                "public": False,
                "title": "Outline Document 2",
                "urlpath": "outline/doc2",
                "children": [
                    {
                        "id": doc4.id,
                        "public": False,
                        "title": "Outline Document 4",
                        "urlpath": "outline/doc4",
                        "children": [],
                    }
                ],
            },
        ],
    }


async def test_get_doc_outline_public(api_client: "TestClient"):
    """
    Test getting the document outline as a public user.
    """
    doc1 = await Doc.create(
        title="Public Outline Document 1",
        urlpath="public/outline/doc1",
        public=True,
        metadata={},
        markdown="",
        html="",
    )
    doc2 = await Doc.create(
        title="Public Outline Document 2",
        urlpath="public/outline/doc2",
        public=True,
        metadata={},
        markdown="",
        html="",
    )
    doc3 = await Doc.create(
        parent_id=doc1.id,
        title="Public Outline Document 3",
        urlpath="public/outline/doc3",
        public=True,
        metadata={},
        markdown="",
        html="",
    )
    await Doc.create(
        parent_id=doc2.id,
        title="Public Outline Document 4",
        urlpath="public/outline/doc4",
        public=False,
        metadata={},
        markdown="",
        html="",
    )

    response = api_client.get("/api/docs/outline")
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data == {
        "id": 0,
        "public": True,
        "title": "Home",
        "urlpath": "/",
        "children": [
            {
                "id": doc1.id,
                "public": True,
                "title": "Public Outline Document 1",
                "urlpath": "public/outline/doc1",
                "children": [
                    {
                        "id": doc3.id,
                        "public": True,
                        "title": "Public Outline Document 3",
                        "urlpath": "public/outline/doc3",
                        "children": [],
                    }
                ],
            },
            {
                "id": doc2.id,
                "public": True,
                "title": "Public Outline Document 2",
                "urlpath": "public/outline/doc2",
                "children": [],
            },
        ],
    }


async def test_get_doc_by_id(api_client: "TestClient", user_admin: "User"):
    """
    Test getting a document by ID.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Test Get Document",
        urlpath="test/get/document",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.get(f"/api/docs/{doc.id}")
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data == {
        "id": doc.id,
        "title": "Test Get Document",
        "urlpath": "test/get/document",
        "parent_id": None,
        "public": False,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "updated_by_id": user_admin.id,
        "markdown": "",
        "html": "",
        "metadata": {"subtitles": []},
        "parents": [],
        "children": [],
    }


async def test_get_nonexistent_doc_by_id(api_client: "TestClient", user_admin: "User"):
    """
    Test getting a document by a non-existent ID.
    """
    api_client.set_session_user(user_admin)
    response = api_client.get("/api/docs/9999")  # Assuming this ID does not exist
    assert response.status_code == status.HTTP_404_NOT_FOUND, response.text
    data = response.json()
    assert data["detail"] == "Document not found"


async def test_get_doc_by_urlpath(api_client: "TestClient", user_admin: "User"):
    """
    Test getting a document by URL path.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Test Get Document by URL",
        urlpath="test/get/document/url",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.get("/api/docs/by_path", params={"path": doc.urlpath})
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data == {
        "id": doc.id,
        "title": "Test Get Document by URL",
        "urlpath": "test/get/document/url",
        "parent_id": None,
        "public": False,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "updated_by_id": user_admin.id,
        "markdown": "",
        "html": "",
        "metadata": {"subtitles": []},
        "parents": [],
        "children": [],
    }


async def test_get_nonexistent_doc_by_urlpath(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test getting a document by a non-existent URL path.
    """
    api_client.set_session_user(user_admin)
    response = api_client.get("/api/docs/by_path", params={"path": "nonexistent/path"})
    assert response.status_code == status.HTTP_404_NOT_FOUND, response.text
    data = response.json()
    assert data["detail"] == "Document not found"


async def test_get_doc_by_urlpath_public(api_client: "TestClient"):
    """
    Test getting a public document by URL path.
    """
    doc = await Doc.create(
        title="Public Document",
        urlpath="public/document",
        public=True,
        metadata={"subtitles": []},
        markdown="",
        html="",
    )
    await Doc.create(
        parent_id=doc.id,
        title="Child Private Document",
        urlpath="public/document/child",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
    )
    response = api_client.get("/api/docs/by_path", params={"path": doc.urlpath})
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data == {
        "id": doc.id,
        "title": "Public Document",
        "urlpath": "public/document",
        "parent_id": None,
        "public": True,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "updated_by_id": None,
        "markdown": "",
        "html": "",
        "metadata": {"subtitles": []},
        "parents": [],
        "children": [],
    }


async def test_get_private_doc_unauthenticated(api_client: "TestClient"):
    """
    Test getting a private document without authentication.
    """
    doc = await Doc.create(
        title="Private Document",
        urlpath="private/document",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
    )
    response = api_client.get("/api/docs/by_path", params={"path": doc.urlpath})
    assert response.status_code == status.HTTP_404_NOT_FOUND, response.text
    data = response.json()
    assert data["detail"] == "Document not found"


async def test_get_doc_with_timestamp(api_client: "TestClient", user_admin: "User"):
    """
    Test getting a document with a timestamp.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Document with Timestamp",
        urlpath="document/with/timestamp",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.get(
        f"/api/docs/{doc.id}", params={"timestamp": doc.updated_at.isoformat()}
    )
    assert response.status_code == status.HTTP_304_NOT_MODIFIED, response.text


async def test_get_doc_with_non_matching_timestamp(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test getting a document with a non-matching timestamp.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Document with Invalid Timestamp",
        urlpath="document/with/invalid/timestamp",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.get(
        f"/api/docs/{doc.id}",
        params={"timestamp": "2023-01-01T00:00:00Z"},
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data["id"] == doc.id


async def test_get_doc_revisions(api_client: "TestClient", user_admin: "User"):
    """
    Test getting document revisions.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Test Document Revisions",
        urlpath="test/document/revisions",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    rev1 = await Revision.create(
        doc_id=doc.id,
        markdown="Initial content",
        html="<p>Initial content</p>",
        created_by_id=user_admin.id,
    )
    rev2 = await Revision.create(
        doc_id=doc.id,
        markdown="Updated content",
        html="<p>Updated content</p>",
        created_by_id=user_admin.id,
    )
    response = api_client.get(f"/api/docs/{doc.id}/revisions")
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data == {
        "items": [
            {
                "id": rev2.id,
                "doc_id": doc.id,
                "markdown": "Updated content",
                "html": "<p>Updated content</p>",
                "created_at": data["items"][0]["created_at"],
                "created_by_id": user_admin.id,
                "created_by_username": user_admin.username,
            },
            {
                "id": rev1.id,
                "doc_id": doc.id,
                "markdown": "Initial content",
                "html": "<p>Initial content</p>",
                "created_at": data["items"][1]["created_at"],
                "created_by_id": user_admin.id,
                "created_by_username": user_admin.username,
            },
        ],
        "total": 2,
        "page": 1,
        "size": -1,
    }


async def test_get_doc_revisions_invalid_id(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test getting revisions for a document with an invalid ID.
    """
    api_client.set_session_user(user_admin)
    response = api_client.get(
        "/api/docs/9999/revisions"
    )  # Assuming this ID does not exist
    assert response.status_code == status.HTTP_404_NOT_FOUND, response.text
    data = response.json()
    assert data["detail"] == "Document not found"


async def test_get_doc_revisions_unauthorized(
    api_client: "TestClient", user_viewer: "User"
):
    """
    Test getting revisions for a document as a user without permission.
    """
    api_client.set_session_user(user_viewer)
    doc = await Doc.create(
        title="Unauthorized Revisions Document",
        urlpath="unauthorized/revisions/document",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
    )
    response = api_client.get(f"/api/docs/{doc.id}/revisions")
    assert response.status_code == status.HTTP_403_FORBIDDEN, response.text
    data = response.json()
    assert data["detail"] == "You do not have permission to view document revisions"


async def test_update_doc(api_client: "TestClient", user_admin: "User"):
    """
    Test updating a document.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Document to Update",
        urlpath="document/to/update",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    doc2 = await Doc.create(
        title="Another Document",
        urlpath="another/document",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.put(
        f"/api/docs/{doc.id}",
        json={
            "parent_id": doc2.id,
            "title": "Updated Document Title",
            "urlpath": "document/to/update/updated",
            "public": True,
            "metadata": {"subtitles": ["en", "es"]},
            "markdown": "# Updated Markdown Content",
        },
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data == {
        "id": doc.id,
        "title": "Updated Document Title",
        "urlpath": "document/to/update/updated",
        "parent_id": doc2.id,
        "public": True,
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "updated_by_id": user_admin.id,
        "markdown": "# Updated Markdown Content",
        "html": '<h1 id="section-updated-markdown-content">Updated Markdown Content<a class="heading-anchor" href="#section-updated-markdown-content">#</a></h1>\n',
        "metadata": {
            "subtitles": [
                {
                    "hash": "section-updated-markdown-content",
                    "title": "Updated Markdown Content",
                }
            ],
        },
        "parents": [],
        "children": [],
    }
    assert await doc.revisions.all().count() == 1


async def test_update_doc_with_invalid_id(api_client: "TestClient", user_admin: "User"):
    """
    Test updating a document with an invalid ID.
    """
    api_client.set_session_user(user_admin)
    response = api_client.put(
        "/api/docs/9999",  # Assuming this ID does not exist
        json={
            "title": "Invalid Update Document",
            "urlpath": "invalid/update/document",
        },
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND, response.text
    data = response.json()
    assert data["detail"] == "Document not found"


async def test_update_doc_unauthorized(api_client: "TestClient", user_viewer: "User"):
    """
    Test updating a document as a user without permission.
    """
    api_client.set_session_user(user_viewer)
    doc = await Doc.create(
        title="Unauthorized Update Document",
        urlpath="unauthorized/update/document",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
    )
    response = api_client.put(
        f"/api/docs/{doc.id}",
        json={
            "title": "Unauthorized Update Attempt",
            "urlpath": "unauthorized/update/attempt",
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN, response.text
    data = response.json()
    assert data["detail"] == "You do not have permission to update this document"


async def test_update_doc_parent_none(api_client: "TestClient", user_admin: "User"):
    """
    Test updating a document to have no parent.
    """
    api_client.set_session_user(user_admin)
    parent = await Doc.create(
        title="Parent Document",
        urlpath="parent/document",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    doc = await Doc.create(
        parent_id=parent.id,
        title="Document with Parent",
        urlpath="document/with/parent",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.put(
        f"/api/docs/{doc.id}",
        json={
            "parent_id": 0,
        },
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data["parent_id"] is None
    assert await doc.revisions.all().count() == 0


async def test_update_doc_with_invalid_parent(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test updating a document with an invalid parent ID.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Document with Invalid Parent",
        urlpath="document/with/invalid/parent",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.put(
        f"/api/docs/{doc.id}",
        json={"parent_id": 9999},
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
    data = response.json()
    assert data["detail"] == "Parent document not found"


async def test_update_doc_with_same_parent(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test updating a document with its own parent ID.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Document with Same Parent",
        urlpath="document/with/same/parent",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.put(
        f"/api/docs/{doc.id}",
        json={
            "parent_id": doc.id,
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
    data = response.json()
    assert data["detail"] == "Cannot set a document as its own parent"


async def test_update_doc_with_circular_parent(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test updating a document to create a circular parent relationship.
    """
    api_client.set_session_user(user_admin)
    parent = await Doc.create(
        title="Parent Document",
        urlpath="parent/document",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    child = await Doc.create(
        parent_id=parent.id,
        title="Child Document",
        urlpath="child/document",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.put(
        f"/api/docs/{parent.id}",
        json={
            "parent_id": child.id,
        },
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
    data = response.json()
    assert data["detail"] == "Cannot set a document as a child of its own descendant"


async def test_move_doc_up(api_client: "TestClient", user_admin: "User"):
    """
    Test moving a document up in the order.
    """
    doc1 = await Doc.create(
        title="Doc 1",
        urlpath="doc/1",
        public=False,
        metadata={},
        markdown="",
        html="",
        order=99,
    )
    doc2 = await Doc.create(
        title="Doc 2",
        urlpath="doc/2",
        public=False,
        metadata={},
        markdown="",
        html="",
        order=100,
    )
    doc3 = await Doc.create(
        title="Doc 3",
        urlpath="doc/3",
        public=False,
        metadata={},
        markdown="",
        html="",
        order=98,
    )
    api_client.set_session_user(user_admin)
    response = api_client.post(
        f"/api/docs/{doc2.id}/move?direction=up",
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT, response.text
    await doc1.refresh_from_db()
    await doc2.refresh_from_db()
    await doc3.refresh_from_db()
    assert doc3.order == 0
    assert doc2.order == 1
    assert doc1.order == 2


async def test_move_doc_down(api_client: "TestClient", user_admin: "User"):
    """
    Test moving a document down in the order.
    """
    doc1 = await Doc.create(
        title="Doc 1",
        urlpath="doc/1",
        public=False,
        metadata={},
        markdown="",
        html="",
        order=99,
    )
    doc2 = await Doc.create(
        title="Doc 2",
        urlpath="doc/2",
        public=False,
        metadata={},
        markdown="",
        html="",
        order=100,
    )
    doc3 = await Doc.create(
        title="Doc 3",
        urlpath="doc/3",
        public=False,
        metadata={},
        markdown="",
        html="",
        order=98,
    )
    api_client.set_session_user(user_admin)
    response = api_client.post(
        f"/api/docs/{doc1.id}/move?direction=down",
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT, response.text
    await doc1.refresh_from_db()
    await doc2.refresh_from_db()
    await doc3.refresh_from_db()
    assert doc3.order == 0
    assert doc2.order == 1
    assert doc1.order == 2


async def test_move_doc_invalid_id(api_client: "TestClient", user_admin: "User"):
    """
    Test moving a document with an invalid ID.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/docs/9999/move?direction=up"  # Assuming this ID does not exist
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND, response.text
    data = response.json()
    assert data["detail"] == "Document not found"


async def test_move_doc_unauthorized(api_client: "TestClient", user_viewer: "User"):
    """
    Test moving a document as a user without permission.
    """
    api_client.set_session_user(user_viewer)
    doc = await Doc.create(
        title="Unauthorized Move Document",
        urlpath="unauthorized/move/document",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
    )
    response = api_client.post(f"/api/docs/{doc.id}/move?direction=up")
    assert response.status_code == status.HTTP_403_FORBIDDEN, response.text
    data = response.json()
    assert data["detail"] == "You do not have permission to edit this document"


async def test_restore_doc_revision(api_client: "TestClient", user_admin: "User"):
    """
    Test restoring a document to a previous revision.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Document to Restore",
        urlpath="document/to/restore",
        public=False,
        metadata={"subtitles": []},
        markdown="Initial content",
        html="<p>Initial content</p>\n",
        updated_by_id=user_admin.id,
    )
    rev = await Revision.create(
        doc_id=doc.id,
        markdown="First revision content",
        html="<p>First revision content</p>\n",
        created_by_id=user_admin.id,
    )

    response = api_client.post(
        f"/api/docs/{doc.id}/restore_revision", params={"revision_id": rev.id}
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT, response.text
    await doc.refresh_from_db()
    assert doc.markdown == "First revision content"
    assert doc.html == "<p>First revision content</p>\n"
    assert await doc.revisions.all().count() == 2


async def test_restore_doc_revision_invalid_id(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test restoring a document with an invalid document ID.
    """
    api_client.set_session_user(user_admin)
    response = api_client.post(
        "/api/docs/9999/restore_revision", params={"revision_id": 1}
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND, response.text
    data = response.json()
    assert data["detail"] == "Document not found"


async def test_restore_doc_revision_invalid_revision(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test restoring a document with an invalid revision ID.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Document with Invalid Revision",
        urlpath="document/with/invalid/revision",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.post(
        f"/api/docs/{doc.id}/restore_revision", params={"revision_id": 9999}
    )  # Assuming this ID does not exist
    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text
    data = response.json()
    assert data["detail"] == "Revision not found"


async def test_restore_doc_revision_unauthorized(
    api_client: "TestClient", user_viewer: "User"
):
    """
    Test restoring a document as a user without permission.
    """
    api_client.set_session_user(user_viewer)
    doc = await Doc.create(
        title="Unauthorized Restore Document",
        urlpath="unauthorized/restore/document",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
    )
    rev = await Revision.create(
        doc_id=doc.id,
        markdown="Unauthorized revision content",
        html="<p>Unauthorized revision content</p>\n",
        created_by_id=user_viewer.id,
    )
    response = api_client.post(
        f"/api/docs/{doc.id}/restore_revision", params={"revision_id": rev.id}
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN, response.text
    data = response.json()
    assert data["detail"] == "You do not have permission to edit this document"


async def test_delete_doc(api_client: "TestClient", user_admin: "User"):
    """
    Test deleting a document.
    """
    api_client.set_session_user(user_admin)
    doc = await Doc.create(
        title="Document to Delete",
        urlpath="document/to/delete",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
        updated_by_id=user_admin.id,
    )
    response = api_client.delete(f"/api/docs/{doc.id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT, response.text
    assert await Doc.get_or_none(id=doc.id) is None


async def test_delete_nonexistent_doc(api_client: "TestClient", user_admin: "User"):
    """
    Test deleting a non-existent document.
    """
    api_client.set_session_user(user_admin)
    response = api_client.delete("/api/docs/9999")  # Assuming this ID does not exist
    assert response.status_code == status.HTTP_404_NOT_FOUND, response.text
    data = response.json()
    assert data["detail"] == "Document not found"


async def test_delete_doc_unauthorized(api_client: "TestClient", user_viewer: "User"):
    """
    Test deleting a document as a user without permission.
    """
    api_client.set_session_user(user_viewer)
    doc = await Doc.create(
        title="Unauthorized Delete Document",
        urlpath="unauthorized/delete/document",
        public=False,
        metadata={"subtitles": []},
        markdown="",
        html="",
    )
    response = api_client.delete(f"/api/docs/{doc.id}")
    assert response.status_code == status.HTTP_403_FORBIDDEN, response.text
    data = response.json()
    assert data["detail"] == "You do not have permission to delete this document"


async def test_list_docs(api_client: "TestClient", user_admin: "User"):
    """
    Test listing documents.
    """
    api_client.set_session_user(user_admin)
    doc1 = await Doc.create(
        title="List Document 1",
        urlpath="list/document/1",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    doc2 = await Doc.create(
        title="List Document 2",
        urlpath="list/document/2",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    await Doc.create(
        title="List Document 3",
        urlpath="list/document/3",
        public=False,
        metadata={},
        markdown="",
        html="",
    )
    response = api_client.get("/api/docs/?page=1&size=2")
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data == {
        "items": [
            {
                "id": doc1.id,
                "title": "List Document 1",
                "urlpath": "list/document/1",
                "parent_id": None,
                "public": False,
                "created_at": data["items"][0]["created_at"],
                "updated_at": data["items"][0]["updated_at"],
                "updated_by_id": None,
                "markdown": "",
                "html": "",
                "metadata": {},
                "parents": [],
                "children": [],
            },
            {
                "id": doc2.id,
                "title": "List Document 2",
                "urlpath": "list/document/2",
                "parent_id": None,
                "public": False,
                "created_at": data["items"][1]["created_at"],
                "updated_at": data["items"][1]["updated_at"],
                "updated_by_id": None,
                "markdown": "",
                "html": "",
                "metadata": {},
                "parents": [],
                "children": [],
            },
        ],
        "total": 3,
        "page": 1,
        "size": 2,
    }


async def test_search_docs_with_short_query(
    api_client: "TestClient", user_admin: "User"
):
    """
    Test searching documents with a short query.
    """
    from app.settings import settings

    api_client.set_session_user(user_admin)
    await Doc.create(
        title="Search Document 1",
        urlpath="search/doc/1",
        public=False,
        metadata={},
        markdown="This is a test document.",
        html="<p>This is a test document.</p>",
    )
    # This doesn't use the search endpoint since the query is too short
    settings.disable_search = False
    response = api_client.post("/api/docs/search", json={"query": "aa"})
    assert response.status_code == status.HTTP_200_OK, response.text
    data = response.json()
    assert data == {
        "results": [],
        "total": 0,
    }
    settings.disable_search = True


async def test_search_docs_disabled(api_client: "TestClient", user_admin: "User"):
    """
    Test searching documents when search is disabled.
    """
    from app.settings import settings

    api_client.set_session_user(user_admin)
    settings.disable_search = True
    response = api_client.post("/api/docs/search", json={"query": "test"})
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE, response.text
    data = response.json()
    assert data["detail"] == "Search functionality is disabled"
