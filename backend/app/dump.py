import os
import shutil
import zipfile

from .models.doc import Doc
from .settings import settings


def _generate_doc_content(doc) -> str:
    """Generate markdown content for a document."""
    lines = []
    lines.append("---\n")
    lines.append(f"id: {doc.id}\n")
    lines.append(f'title: "{doc.title}"\n')
    lines.append(f"slug: {doc.slug}\n")
    lines.append(f"urlpath: {doc.urlpath}\n")
    lines.append(f"public: {doc.public}\n")
    parent_id_str = f" {doc.parent_id}" if doc.parent else ""
    lines.append(f"parent_id:{parent_id_str}\n")
    lines.append(f"created_at: {doc.created_at.isoformat()}\n")
    lines.append(f"updated_at: {doc.updated_at.isoformat()}\n")
    updated_by_id_str = f" {doc.updated_by.id}" if doc.updated_by else ""
    lines.append(f"updated_by_id:{updated_by_id_str}\n")
    lines.append(
        f'updated_by_username: "{doc.updated_by.username if doc.updated_by else ""}"\n'
    )
    lines.append(f"order: {doc.order}\n")
    lines.append("---\n\n")
    lines.append(f"# {doc.title}\n\n")
    lines.append(doc.markdown)
    return "".join(lines)


def _generate_revision_content(revision) -> str:
    """Generate markdown content for a revision."""
    lines = []
    lines.append("---\n")
    lines.append(f"id: {revision.id}\n")
    lines.append(f"doc_id: {revision.doc_id}\n")
    lines.append(f"created_at: {revision.created_at.isoformat()}\n")
    lines.append(
        f"created_by_id: {revision.created_by.id if revision.created_by else ''}\n"
    )
    lines.append(
        f'created_by_username: "{revision.created_by.username if revision.created_by else ""}"\n'
    )
    lines.append("---\n\n")
    lines.append(revision.markdown)
    return "".join(lines)


async def dump_to_dir(
    directory: str,
    include_revisions: bool = False,
    public_only: bool = False,
    include_attachments: bool = False,
) -> None:
    """Dump documents to Markdown files."""

    # Ensure the directory exists
    os.makedirs(directory, exist_ok=True)

    # Fetch all documents
    docs = Doc.all()
    if public_only:
        docs = docs.filter(public=True)
    prefetch = ["updated_by"]
    if include_revisions:
        prefetch.extend(["revisions", "revisions__created_by"])
    if include_attachments:
        prefetch.append("uploads")
    docs = docs.prefetch_related(*prefetch)

    async for doc in docs:
        file_path = os.path.join(directory, f"{doc.urlpath}.md")
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(_generate_doc_content(doc))
        if include_revisions:
            for revision in doc.revisions:
                revision_file_path = os.path.join(
                    directory,
                    f"{doc.urlpath}__revisions/{revision.created_at.strftime('%Y%m%d%H%M%S')}.md",
                )
                os.makedirs(os.path.dirname(revision_file_path), exist_ok=True)
                with open(revision_file_path, "w", encoding="utf-8") as rf:
                    rf.write(_generate_revision_content(revision))
        if include_attachments:
            for upload in doc.uploads:
                attachment_path = os.path.join(
                    directory,
                    f"{doc.urlpath}__attachments/{upload.filename}",
                )
                os.makedirs(os.path.dirname(attachment_path), exist_ok=True)
                source_path = settings.uploads_dir / upload.storage_path
                shutil.copy2(source_path, attachment_path)


async def dump_to_zip(
    zip_path: str,
    include_revisions: bool = False,
    public_only: bool = False,
    include_attachments: bool = False,
) -> None:
    """Dump documents to a zip file containing Markdown files."""

    # Fetch all documents
    docs = Doc.all()
    if public_only:
        docs = docs.filter(public=True)
    prefetch = ["updated_by"]
    if include_revisions:
        prefetch.extend(["revisions", "revisions__created_by"])
    if include_attachments:
        prefetch.append("uploads")
    docs = docs.prefetch_related(*prefetch)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        async for doc in docs:
            file_path = f"{doc.urlpath}.md"
            zf.writestr(file_path, _generate_doc_content(doc))
            if include_revisions:
                for revision in doc.revisions:
                    revision_file_path = f"{doc.urlpath}__revisions/{revision.created_at.strftime('%Y%m%d%H%M%S')}.md"
                    zf.writestr(
                        revision_file_path, _generate_revision_content(revision)
                    )
            if include_attachments:
                for upload in doc.uploads:
                    attachment_path = f"{doc.urlpath}__attachments/{upload.filename}"
                    source_path = settings.uploads_dir / upload.storage_path
                    zf.write(source_path, attachment_path)


async def dump_to_single_file(file_path: str, public_only: bool = False) -> None:
    """Dump all documents to a single Markdown file for LLM consumption."""

    async def write_doc_tree(f, parent_id: int | None) -> None:
        """Recursively write documents in tree order (depth-first, ordered by order/title)."""
        docs = Doc.filter(parent_id=parent_id).order_by("order", "title")
        if public_only:
            docs = docs.filter(public=True)
        async for doc in docs:
            f.write("=" * 80)
            f.write(f"\n<!-- path: /{doc.urlpath} -->\n\n")
            f.write(f"# {doc.title}\n\n")
            f.write(doc.markdown)
            f.write("\n\n")
            await write_doc_tree(f, doc.id)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(f"# {settings.site_name}\n\n")
        if settings.site_description:
            f.write(f"{settings.site_description}\n\n")
        await write_doc_tree(f, None)
