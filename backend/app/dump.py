import os

from .models.doc import Doc


async def dump_to_markdown(directory: str, include_revisions: bool = False) -> None:
    """Dump documents to Markdown files."""

    # Ensure the directory exists
    os.makedirs(directory, exist_ok=True)

    # Fetch all documents
    docs = Doc.all()
    if include_revisions:
        docs = docs.prefetch_related("updated_by", "revisions", "revisions__created_by")
    else:
        docs = docs.prefetch_related("updated_by")

    async for doc in docs:
        file_path = os.path.join(directory, f"{doc.urlpath}.md")
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write("---\n")
            f.write(f"id: {doc.id}\n")
            f.write(f'title: "{doc.title}"\n')
            f.write(f"urlpath: {doc.urlpath}\n")
            f.write(f"public: {doc.public}\n")
            f.write(f"parent_id: {doc.parent_id if doc.parent else ''}\n")
            f.write(f"created_at: {doc.created_at.isoformat()}\n")
            f.write(f"updated_at: {doc.updated_at.isoformat()}\n")
            f.write(f"updated_by_id: {doc.updated_by.id if doc.updated_by else ''}\n")
            f.write(
                f'updated_by_username: "{doc.updated_by.username if doc.updated_by else ""}"\n'
            )
            f.write(f"order: {doc.order}\n")
            f.write("---\n\n")
            f.write(f"# {doc.title}\n\n")
            f.write(doc.markdown)
        if include_revisions:
            for revision in doc.revisions:
                revision_file_path = os.path.join(
                    directory,
                    f"{doc.urlpath}__revisions/{revision.created_at.strftime('%Y%m%d%H%M%S')}.md",
                )
                os.makedirs(os.path.dirname(revision_file_path), exist_ok=True)
                with open(revision_file_path, "w", encoding="utf-8") as rf:
                    rf.write("---\n")
                    rf.write(f"id: {revision.id}\n")
                    rf.write(f"doc_id: {revision.doc_id}\n")
                    rf.write(f"created_at: {revision.created_at.isoformat()}\n")
                    rf.write(
                        f"created_by_id: {revision.created_by.id if revision.created_by else ''}\n"
                    )
                    rf.write(
                        f'created_by_username: "{revision.created_by.username if revision.created_by else ""}"\n'
                    )
                    rf.write("---\n\n")
                    rf.write(revision.markdown)
