import hashlib
import json
from dataclasses import dataclass, field

from ..models.doc import Doc
from ..models.user import User


@dataclass
class DocNode:
    """
    A document in the document tree, without its content.
    """

    id: int
    parent_id: int | None
    title: str
    urlpath: str
    public: bool
    children: list["DocNode"] = field(default_factory=list)


@dataclass
class DocTree:
    """
    The documents a user may see arranged as a tree, loaded with a single query.
    """

    nodes: dict[int, DocNode]
    home: DocNode | None

    def parents(self, parent_id: int | None) -> list[DocNode]:
        """
        Get the parents of a document from its parent's ID, starting with the home page.
        For anonymous users, this stops below the closest private parent.
        """
        parents = []
        while parent_id is not None and parent_id in self.nodes:
            parent = self.nodes[parent_id]
            parents.append(parent)
            parent_id = parent.parent_id
        parents.reverse()
        return parents

    def descendant_ids(self, node: DocNode) -> set[int]:
        ids = set()
        stack = list(node.children)
        while stack:
            child = stack.pop()
            ids.add(child.id)
            stack.extend(child.children)
        return ids

    def flatten(
        self, exclude: frozenset[int] | set[int] = frozenset()
    ) -> list[tuple[DocNode, int]]:
        """
        Get all documents depth-first from the home page, with their depth,
        leaving out the excluded documents and their descendants.
        """
        result: list[tuple[DocNode, int]] = []

        def visit(node: DocNode, depth: int) -> None:
            if node.id in exclude:
                return
            result.append((node, depth))
            for child in node.children:
                visit(child, depth + 1)

        if self.home is not None:
            visit(self.home, 0)
        return result


async def load_doc_tree(user: User | None) -> DocTree:
    """
    Load the documents the user may see. Anonymous users only get public
    documents, so private ones and their titles can't end up in their pages.
    Public documents under a private one are loaded, but aren't reachable
    from the home page, so they're left out of the outline.
    """
    query = Doc.all()
    if user is None:
        query = query.filter(public=True)
    rows = await query.order_by("order", "title").values(
        "id", "parent_id", "title", "urlpath", "public"
    )
    nodes = {row["id"]: DocNode(**row) for row in rows}
    home = None
    for node in nodes.values():
        if node.parent_id is None:
            if home is None:
                home = node
        elif node.parent_id in nodes:
            nodes[node.parent_id].children.append(node)
    return DocTree(nodes=nodes, home=home)


def outline_version(outline: DocNode | None, user: User | None) -> str:
    """
    Get a version identifier for the sidebar, which changes whenever
    the outline or anything else the sidebar shows changes.
    """

    def serialize(node: DocNode) -> list:
        return [node.title, node.urlpath, [serialize(c) for c in node.children]]

    data = [
        serialize(outline) if outline else None,
        [user.id, user.username, user.role] if user else None,
    ]
    return hashlib.sha256(json.dumps(data).encode("utf-8")).hexdigest()[:16]
