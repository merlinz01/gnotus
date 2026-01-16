import re
from typing import TYPE_CHECKING, AsyncGenerator

import nh3
from bs4 import BeautifulSoup
from bs4.element import Tag
from fastapi import HTTPException
from tortoise import fields

from ..schemas.doc import DocSubtitle
from .utils import TimestampedModel

if TYPE_CHECKING:  # pragma: no cover
    from .revision import Revision
    from .upload import Upload
    from .user import User


def slugify(text: str) -> str:
    """
    Convert a string to a URL-friendly slug.
    """
    text = text.strip().lower()
    text = re.sub(r"[^\s\w]", "", text)
    text = re.sub(r"\s+", "-", text)
    return text[:50]


class Doc(TimestampedModel):
    """
    Model representing a document.
    """

    id = fields.IntField(primary_key=True)
    parent_id: int | None
    parent: fields.ForeignKeyNullableRelation["Doc"] = fields.ForeignKeyField(
        "gnotus.Doc", null=True, related_name="children", on_delete=fields.CASCADE
    )
    title = fields.CharField(max_length=255)
    slug = fields.CharField(max_length=100)
    urlpath = fields.CharField(max_length=255, unique=True)
    public = fields.BooleanField(default=False)
    metadata = fields.JSONField()
    markdown = fields.TextField()
    html = fields.TextField()
    updated_by_id: int | None
    updated_by: fields.ForeignKeyNullableRelation["User"] = fields.ForeignKeyField(
        "gnotus.User", null=True, on_delete=fields.SET_NULL
    )
    order = fields.IntField(default=0)

    children: fields.ReverseRelation["Doc"]
    revisions: fields.ReverseRelation["Revision"]
    uploads: fields.ReverseRelation["Upload"]

    class Meta:  # type: ignore
        table = "docs"
        ordering = ["order", "title"]
        unique_together = [("parent_id", "slug")]

    @staticmethod
    def validate_slug(slug: str) -> None:
        if not slug or not re.match(r"^[a-zA-Z0-9-_]+$", slug):
            raise HTTPException(
                status_code=400,
                detail="Invalid URL slug. Only alphanumeric characters, hyphens, and underscores allowed.",
            )
        if len(slug) > 100:
            raise HTTPException(
                status_code=400,
                detail="URL slug must be 100 characters or less.",
            )

    async def parents(self) -> AsyncGenerator["Doc", None]:
        """
        Asynchronously yield all parent documents of this document.
        """
        await self.fetch_related("parent")
        current = self.parent
        while current:  # pragma: no cover
            yield current
            await current.fetch_related("parent")
            current = current.parent

    async def compute_urlpath(self) -> str:
        """
        Compute the full URL path by traversing parent hierarchy.
        Uses parent_id directly to handle in-memory changes that haven't been committed.
        Returns path with leading slash (e.g., "/docs/guide").
        Home page children have paths like "/child", not "child".
        """
        segments = [self.slug]
        current_parent_id = self.parent_id
        while current_parent_id is not None:
            parent = await Doc.get(id=current_parent_id)
            if parent.parent_id is not None:  # Skip home page
                segments.append(parent.slug)
            current_parent_id = parent.parent_id
        return "/" + "/".join(reversed(segments))

    async def update_urlpath(self, cascade: bool = True, reindex: bool = True) -> None:
        """
        Update the urlpath based on current slug and parent hierarchy.
        If cascade is True, also updates all descendant documents.
        If reindex is True, also updates the search index.
        """
        self.urlpath = await self.compute_urlpath()
        await self.save(update_fields=["urlpath"])

        if reindex:
            # Lazy import to avoid circular dependency
            from ..indexing import index_document
            from ..settings import settings

            if not settings.disable_search:
                await index_document(self)

        if cascade:
            await self.fetch_related("children")
            for child in self.children:
                await child.update_urlpath(cascade=True, reindex=reindex)

    async def update_content(self) -> None:
        """
        Update the metadata of the document as well as the HTML content.
        This includes generating subtitles and ensuring unique IDs for headings.
        This method should be called after any changes to the markdown content.
        """
        from markdown_it import MarkdownIt

        self.html = nh3.clean(
            MarkdownIt("gfm-like").disable("code").render(self.markdown)
        )
        soup = BeautifulSoup(self.html, "html.parser")
        subtitles = []
        for tag in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
            if isinstance(tag, Tag):
                text = tag.get_text()
                if not text:
                    continue  # pragma: no cover
                hash = str(tag.get("id", "") or slugify(text))
                if not hash:
                    continue  # pragma: no cover
                hash = "section-" + hash
                existing_hashes = {subtitle.hash for subtitle in subtitles}
                count = 1
                original_hash = hash
                while hash in existing_hashes:  # pragma: no cover
                    hash = f"{original_hash}-{count}"
                    count += 1
                tag.attrs["id"] = hash
                tag.insert(
                    len(tag.contents),
                    soup.new_tag(
                        "a",
                        attrs={"class": "heading-anchor", "href": f"#{hash}"},
                        string="#",
                    ),
                )
                subtitles.append(DocSubtitle(title=text, hash=hash))
        self.html = str(soup)
        self.metadata["subtitles"] = [
            DocSubtitle(title=subtitle.title, hash=subtitle.hash).model_dump(
                mode="json"
            )
            for subtitle in subtitles
        ]
