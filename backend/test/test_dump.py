import datetime
import zipfile
from pathlib import Path

from app.dump import dump_to_dir, dump_to_zip
from app.models.doc import Doc
from app.models.revision import Revision
from app.models.user import User


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
