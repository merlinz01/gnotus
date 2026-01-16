import datetime
import zipfile
from pathlib import Path

from app.models.doc import Doc
from app.models.revision import Revision
from app.models.setting import Setting
from app.models.upload import Upload
from app.models.user import User
from app.settings import settings
from app.utils.dump import dump_to_dir, dump_to_single_file, dump_to_zip


async def test_dump_docs(api_client, tmpdir: Path, user_admin: User):
    """Test the dump docs endpoint."""
    doc1 = await Doc.create(
        title="Test Doc 1",
        slug="test-doc-1",
        urlpath="test-doc-1",
        public=True,
        markdown="This is a test document.",
        html="",
        metadata={},
    )
    doc2 = await Doc.create(
        parent_id=doc1.id,
        title="Test Doc 2",
        slug="test-doc-2",
        urlpath="test-doc-1/test-doc-2",
        public=True,
        markdown="This is another test document.",
        html="",
        metadata={},
        updated_by_id=user_admin.id,
    )
    await dump_to_dir(str(tmpdir), include_revisions=False)
    assert (tmpdir / "test-doc-1.md").exists()
    assert (
        (tmpdir / "test-doc-1.md").read_text("utf-8")
        == f"""---
id: {doc1.id}
title: "Test Doc 1"
slug: test-doc-1
urlpath: test-doc-1
public: True
parent_id:
created_at: {doc1.created_at.isoformat()}
updated_at: {doc1.updated_at.isoformat()}
updated_by_id:
updated_by_username: ""
order: 0
---

# Test Doc 1

This is a test document."""
    )
    assert (tmpdir / "test-doc-1/test-doc-2.md").exists()
    assert (
        (tmpdir / "test-doc-1/test-doc-2.md").read_text("utf-8")
        == f"""---
id: {doc2.id}
title: "Test Doc 2"
slug: test-doc-2
urlpath: test-doc-1/test-doc-2
public: True
parent_id: {doc1.id}
created_at: {doc2.created_at.isoformat()}
updated_at: {doc2.updated_at.isoformat()}
updated_by_id: {user_admin.id}
updated_by_username: "{user_admin.username}"
order: 0
---

# Test Doc 2

This is another test document."""
    )


async def test_dump_docs_with_revisions(api_client, tmpdir: Path, user_admin: User):
    """Test the dump docs endpoint with revisions."""
    doc1 = await Doc.create(
        title="Test Doc 1",
        slug="test-doc-1",
        urlpath="test-doc-1",
        public=True,
        markdown="This is a test document.",
        html="",
        metadata={},
    )
    rev1 = await Revision.create(
        doc_id=doc1.id,
        markdown="This is a test revision.",
        html="",
        created_by_id=user_admin.id,
    )
    rev2 = await Revision.create(
        doc_id=doc1.id,
        markdown="This is an another test revision.",
        html="",
        created_by_id=user_admin.id,
    )
    rev2.created_at = rev1.created_at + datetime.timedelta(seconds=1)
    await rev2.save()
    await dump_to_dir(str(tmpdir), include_revisions=True)
    assert (tmpdir / "test-doc-1.md").exists()
    assert (
        (tmpdir / "test-doc-1.md").read_text("utf-8")
        == f"""---
id: {doc1.id}
title: "Test Doc 1"
slug: test-doc-1
urlpath: test-doc-1
public: True
parent_id:
created_at: {doc1.created_at.isoformat()}
updated_at: {doc1.updated_at.isoformat()}
updated_by_id:
updated_by_username: ""
order: 0
---

# Test Doc 1

This is a test document."""
    )
    assert (tmpdir / "test-doc-1__revisions/").exists()
    assert (
        tmpdir / f"test-doc-1__revisions/{rev1.created_at.strftime('%Y%m%d%H%M%S')}.md"
    ).exists()
    assert (
        (
            tmpdir
            / f"test-doc-1__revisions/{rev1.created_at.strftime('%Y%m%d%H%M%S')}.md"
        ).read_text("utf-8")
        == f"""---
id: {rev1.id}
doc_id: {doc1.id}
created_at: {rev1.created_at.isoformat()}
created_by_id: {user_admin.id}
created_by_username: "{user_admin.username}"
---

This is a test revision."""
    )

    assert (
        tmpdir / f"test-doc-1__revisions/{rev2.created_at.strftime('%Y%m%d%H%M%S')}.md"
    ).exists()
    assert (
        (
            tmpdir
            / f"test-doc-1__revisions/{rev2.created_at.strftime('%Y%m%d%H%M%S')}.md"
        ).read_text("utf-8")
        == f"""---
id: {rev2.id}
doc_id: {doc1.id}
created_at: {rev2.created_at.isoformat()}
created_by_id: {user_admin.id}
created_by_username: "{user_admin.username}"
---

This is an another test revision."""
    )


async def test_dump_docs_to_zip(api_client, tmpdir: Path, user_admin: User):
    """Test dumping docs to a zip file."""
    doc1 = await Doc.create(
        title="Test Doc 1",
        slug="test-doc-1",
        urlpath="test-doc-1",
        public=True,
        markdown="This is a test document.",
        html="",
        metadata={},
    )
    doc2 = await Doc.create(
        parent_id=doc1.id,
        title="Test Doc 2",
        slug="test-doc-2",
        urlpath="test-doc-1/test-doc-2",
        public=True,
        markdown="This is another test document.",
        html="",
        metadata={},
        updated_by_id=user_admin.id,
    )
    zip_path = tmpdir / "dump.zip"
    await dump_to_zip(str(zip_path), include_revisions=False)
    assert zip_path.exists()
    with zipfile.ZipFile(zip_path, "r") as zf:
        assert "test-doc-1.md" in zf.namelist()
        assert "test-doc-1/test-doc-2.md" in zf.namelist()
        assert (
            zf.read("test-doc-1.md").decode("utf-8")
            == f"""---
id: {doc1.id}
title: "Test Doc 1"
slug: test-doc-1
urlpath: test-doc-1
public: True
parent_id:
created_at: {doc1.created_at.isoformat()}
updated_at: {doc1.updated_at.isoformat()}
updated_by_id:
updated_by_username: ""
order: 0
---

# Test Doc 1

This is a test document."""
        )
        assert (
            zf.read("test-doc-1/test-doc-2.md").decode("utf-8")
            == f"""---
id: {doc2.id}
title: "Test Doc 2"
slug: test-doc-2
urlpath: test-doc-1/test-doc-2
public: True
parent_id: {doc1.id}
created_at: {doc2.created_at.isoformat()}
updated_at: {doc2.updated_at.isoformat()}
updated_by_id: {user_admin.id}
updated_by_username: "{user_admin.username}"
order: 0
---

# Test Doc 2

This is another test document."""
        )


async def test_dump_docs_to_zip_with_revisions(
    api_client, tmpdir: Path, user_admin: User
):
    """Test dumping docs to a zip file with revisions."""
    doc1 = await Doc.create(
        title="Test Doc 1",
        slug="test-doc-1",
        urlpath="test-doc-1",
        public=True,
        markdown="This is a test document.",
        html="",
        metadata={},
    )
    rev1 = await Revision.create(
        doc_id=doc1.id,
        markdown="This is a test revision.",
        html="",
        created_by_id=user_admin.id,
    )
    zip_path = tmpdir / "dump.zip"
    await dump_to_zip(str(zip_path), include_revisions=True)
    assert zip_path.exists()
    with zipfile.ZipFile(zip_path, "r") as zf:
        assert "test-doc-1.md" in zf.namelist()
        revision_path = (
            f"test-doc-1__revisions/{rev1.created_at.strftime('%Y%m%d%H%M%S')}.md"
        )
        assert revision_path in zf.namelist()
        assert (
            zf.read(revision_path).decode("utf-8")
            == f"""---
id: {rev1.id}
doc_id: {doc1.id}
created_at: {rev1.created_at.isoformat()}
created_by_id: {user_admin.id}
created_by_username: "{user_admin.username}"
---

This is a test revision."""
        )


async def test_dump_docs_public_only(api_client, tmpdir: Path, user_admin: User):
    """Test dumping only public docs to a directory."""
    doc1 = await Doc.create(
        title="Public Doc",
        slug="public-doc",
        urlpath="public-doc",
        public=True,
        markdown="This is a public document.",
        html="",
        metadata={},
    )
    await Doc.create(
        title="Private Doc",
        slug="private-doc",
        urlpath="private-doc",
        public=False,
        markdown="This is a private document.",
        html="",
        metadata={},
    )
    await dump_to_dir(str(tmpdir), public_only=True)
    assert (tmpdir / "public-doc.md").exists()
    assert not (tmpdir / "private-doc.md").exists()
    assert (
        (tmpdir / "public-doc.md").read_text("utf-8")
        == f"""---
id: {doc1.id}
title: "Public Doc"
slug: public-doc
urlpath: public-doc
public: True
parent_id:
created_at: {doc1.created_at.isoformat()}
updated_at: {doc1.updated_at.isoformat()}
updated_by_id:
updated_by_username: ""
order: 0
---

# Public Doc

This is a public document."""
    )


async def test_dump_docs_to_zip_public_only(api_client, tmpdir: Path, user_admin: User):
    """Test dumping only public docs to a zip file."""
    doc1 = await Doc.create(
        title="Public Doc",
        slug="public-doc",
        urlpath="public-doc",
        public=True,
        markdown="This is a public document.",
        html="",
        metadata={},
    )
    await Doc.create(
        title="Private Doc",
        slug="private-doc",
        urlpath="private-doc",
        public=False,
        markdown="This is a private document.",
        html="",
        metadata={},
    )
    zip_path = tmpdir / "dump.zip"
    await dump_to_zip(str(zip_path), public_only=True)
    assert zip_path.exists()
    with zipfile.ZipFile(zip_path, "r") as zf:
        assert "public-doc.md" in zf.namelist()
        assert "private-doc.md" not in zf.namelist()
        assert (
            zf.read("public-doc.md").decode("utf-8")
            == f"""---
id: {doc1.id}
title: "Public Doc"
slug: public-doc
urlpath: public-doc
public: True
parent_id:
created_at: {doc1.created_at.isoformat()}
updated_at: {doc1.updated_at.isoformat()}
updated_by_id:
updated_by_username: ""
order: 0
---

# Public Doc

This is a public document."""
        )


async def test_dump_docs_with_attachments(api_client, tmpdir: Path, user_admin: User):
    """Test dumping docs with attachments to a directory."""
    doc1 = await Doc.create(
        title="Test Doc",
        slug="test-doc",
        urlpath="test-doc",
        public=True,
        markdown="This is a test document.",
        html="",
        metadata={},
    )
    # Create upload directory and file
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    storage_path = "test_attachment.png"
    (settings.uploads_dir / storage_path).write_bytes(b"fake image content")
    await Upload.create(
        filename="image.png",
        content_type="image/png",
        size=len(b"fake image content"),
        public=True,
        storage_path=storage_path,
        created_by=user_admin,
        doc=doc1,
    )
    await dump_to_dir(str(tmpdir), include_attachments=True)
    assert (tmpdir / "test-doc.md").exists()
    assert (tmpdir / "test-doc__attachments/image.png").exists()
    assert (tmpdir / "test-doc__attachments/image.png").read_text(
        "utf-8"
    ) == "fake image content"


async def test_dump_docs_to_zip_with_attachments(
    api_client, tmpdir: Path, user_admin: User
):
    """Test dumping docs with attachments to a zip file."""
    doc1 = await Doc.create(
        title="Test Doc",
        slug="test-doc",
        urlpath="test-doc",
        public=True,
        markdown="This is a test document.",
        html="",
        metadata={},
    )
    # Create upload directory and file
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    storage_path = "test_attachment_zip.png"
    (settings.uploads_dir / storage_path).write_bytes(b"fake image content for zip")
    await Upload.create(
        filename="image.png",
        content_type="image/png",
        size=len(b"fake image content for zip"),
        public=True,
        storage_path=storage_path,
        created_by=user_admin,
        doc=doc1,
    )
    zip_path = tmpdir / "dump.zip"
    await dump_to_zip(str(zip_path), include_attachments=True)
    assert zip_path.exists()
    with zipfile.ZipFile(zip_path, "r") as zf:
        assert "test-doc.md" in zf.namelist()
        assert "test-doc__attachments/image.png" in zf.namelist()
        assert (
            zf.read("test-doc__attachments/image.png") == b"fake image content for zip"
        )


async def test_dump_to_single_file(api_client, tmpdir: Path, user_admin: User):
    """Test dumping all docs to a single Markdown file."""
    await Doc.create(
        title="First Doc",
        slug="first-doc",
        urlpath="first-doc",
        public=True,
        markdown="Content of first doc.",
        html="",
        metadata={},
    )
    await Doc.create(
        title="Second Doc",
        slug="second-doc",
        urlpath="second-doc",
        public=True,
        markdown="Content of second doc.",
        html="",
        metadata={},
    )
    file_path = tmpdir / "dump.md"
    await dump_to_single_file(str(file_path))
    assert file_path.exists()
    content = file_path.read_text("utf-8")
    assert content.startswith("# Gnotus\n")
    assert "# First Doc" in content
    assert "<!-- path: /first-doc -->" in content
    assert "Content of first doc." in content
    assert "=" * 80 in content
    assert "# Second Doc" in content
    assert "<!-- path: /second-doc -->" in content
    assert "Content of second doc." in content


async def test_dump_to_single_file_public_only(
    api_client, tmpdir: Path, user_admin: User
):
    """Test dumping only public docs to a single Markdown file."""
    await Doc.create(
        title="Public Doc",
        slug="public-doc",
        urlpath="public-doc",
        public=True,
        markdown="Public content.",
        html="",
        metadata={},
    )
    await Doc.create(
        title="Private Doc",
        slug="private-doc",
        urlpath="private-doc",
        public=False,
        markdown="Private content.",
        html="",
        metadata={},
    )
    file_path = tmpdir / "dump.md"
    await dump_to_single_file(str(file_path), public_only=True)
    assert file_path.exists()
    content = file_path.read_text("utf-8")
    assert content.startswith("# Gnotus\n")
    assert "# Public Doc" in content
    assert "Public content." in content
    assert "Private Doc" not in content
    assert "Private content." not in content
