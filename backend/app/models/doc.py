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

    @staticmethod
    def validate_urlpath(urlpath: str) -> None:
        if not urlpath or not re.match(r"^([a-zA-Z0-9-_]+(/|$))+$", urlpath):
            raise HTTPException(
                status_code=400,
                detail="Invalid URL path",
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
