import datetime
import hashlib
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import Request
from fastapi.responses import HTMLResponse, Response
from fastapi.routing import APIRoute
from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup

from .icons import icon

APP_DIR = Path(__file__).parent.parent
TEMPLATES_DIR = APP_DIR / "templates"
STATIC_DIR = APP_DIR / "static"

# Query parameter that selects the partial rendering of a page
PARTIAL_PARAM = "_partial"


class PageRoute(APIRoute):
    """
    A route that also answers HEAD requests for GET routes, like a static file server.
    The server leaves out the body of responses to HEAD requests.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        if self.methods and "GET" in self.methods:
            self.methods.add("HEAD")


@dataclass
class StaticAsset:
    content: bytes
    media_type: str
    version: str


_IMPORT_RE = re.compile(r"""^@import\s+['"]([^'"]+)['"]\s*;\s*$""", re.MULTILINE)


def _bundle_css(path: Path) -> str:
    """
    Inline the relative @import rules of a stylesheet, recursively.
    """
    css = path.read_text(encoding="utf-8")
    return _IMPORT_RE.sub(
        lambda match: _bundle_css((path.parent / match.group(1)).resolve()), css
    )


def _css_mtime() -> float:
    return max(p.stat().st_mtime for p in (STATIC_DIR / "css").rglob("*.css"))


def _load_css() -> bytes:
    return _bundle_css(STATIC_DIR / "css" / "index.css").encode("utf-8")


def _file_source(name: str, media_type: str):
    path = STATIC_DIR / name
    return (lambda: path.stat().st_mtime, path.read_bytes, media_type)


# Static assets served at /_static/<name>: (mtime, loader, media type)
_ASSET_SOURCES = {
    "gnotus.css": (_css_mtime, _load_css, "text/css; charset=utf-8"),
    "app.js": _file_source("app.js", "text/javascript; charset=utf-8"),
    "theme.js": _file_source("theme.js", "text/javascript; charset=utf-8"),
}
_assets: dict[str, tuple[float, StaticAsset]] = {}
# When each asset's source files were last checked for changes
_checked: dict[str, float] = {}

# How often to check for changes, since every page links to the assets
_CHECK_INTERVAL = 1.0


def get_static_asset(name: str) -> StaticAsset | None:
    """
    Get a static asset by name, reloading it if its source files changed.
    """
    source = _ASSET_SOURCES.get(name)
    if source is None:
        return None
    get_mtime, load, media_type = source
    cached = _assets.get(name)
    now = time.monotonic()
    if cached is not None and now - _checked.get(name, 0) < _CHECK_INTERVAL:
        return cached[1]
    _checked[name] = now
    mtime = get_mtime()
    if cached is not None and cached[0] == mtime:
        return cached[1]
    content = load()
    asset = StaticAsset(
        content=content,
        media_type=media_type,
        version=hashlib.sha256(content).hexdigest()[:12],
    )
    _assets[name] = (mtime, asset)
    return asset


def static_url(name: str) -> str:
    """
    Get the cache-busting URL of a static asset.
    """
    asset = get_static_asset(name)
    if asset is None:  # pragma: no cover
        raise ValueError(f"Unknown static asset: {name}")
    return f"/_static/{name}?v={asset.version}"


def format_date(value: datetime.datetime) -> str:
    """
    Format a date like "January 5, 2026".
    Dates are localized in the browser; this is the fallback.
    """
    return f"{value:%B} {value.day}, {value.year}"


def format_datetime(value: datetime.datetime) -> str:
    """
    Format a date and time like "January 5, 2026, 14:30 UTC".
    Dates are localized in the browser; this is the fallback.
    """
    value = value.astimezone(datetime.timezone.utc)
    return f"{format_date(value)}, {value:%H:%M} UTC"


def format_size(size: int) -> str:
    """
    Format a file size like "1.50 MB".
    """
    if size < 1024:
        return f"{size} B"
    fsize = float(size)
    for unit in ("KB", "MB", "GB"):
        fsize /= 1024
        if fsize < 1024 or unit == "GB":
            break
    return f"{fsize:.2f} {unit}"


env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)
env.globals["icon"] = icon  # type: ignore
env.globals["static_url"] = static_url  # type: ignore
env.filters["format_date"] = format_date
env.filters["format_datetime"] = format_datetime
env.filters["format_size"] = format_size


def render_template(name: str, context: dict[str, Any]) -> str:
    return env.get_template(name).render(context)


def _render_block(name: str, block: str, context: dict[str, Any]) -> Markup:
    template = env.get_template(name)
    return Markup("".join(template.blocks[block](template.new_context(context))))


def is_partial(request: Request) -> bool:
    return request.query_params.get(PARTIAL_PARAM) == "1"


def page_response(
    request: Request,
    template: str,
    context: dict[str, Any],
    status_code: int = 200,
) -> Response:
    """
    Render a page template's head_meta and main blocks into either the
    full page layout or the partial used for client-side navigation.
    """
    context = {
        **context,
        "head_meta": _render_block(template, "head_meta", context),
        "main": _render_block(template, "main", context),
    }
    partial_html = render_template("partial.html", context)
    if is_partial(request):
        return html_response(request, partial_html, status_code, partial=True)
    # Only successful pages are cached by the client
    partial_etag = _etag(partial_html) if status_code == 200 else ""
    page_html = render_template(
        "layout.html", {**context, "partial_etag": partial_etag}
    )
    return html_response(request, page_html, status_code)


def _etag(content: str) -> str:
    return '"' + hashlib.sha256(content.encode("utf-8")).hexdigest()[:32] + '"'


def etag_matches(request: Request, etag: str) -> bool:
    """
    Check whether the request's If-None-Match header matches the ETag.
    Weak validators and suffixes added by compressing proxies are accepted.
    """
    header = request.headers.get("if-none-match")
    if not header:
        return False
    tag = etag.strip('"')
    for candidate in header.split(","):
        candidate = candidate.strip().removeprefix("W/").strip('"')
        if candidate == "*" or candidate.startswith(tag):
            return True
    return False


def html_response(
    request: Request,
    content: str,
    status_code: int = 200,
    partial: bool = False,
) -> Response:
    """
    Create an HTML response that browsers revalidate on every use.
    """
    etag = _etag(content)
    headers = {"ETag": etag, "Cache-Control": "private, no-cache"}
    if partial:
        headers["X-Gnotus-Partial"] = "1"
        headers["X-Robots-Tag"] = "noindex"
    if status_code == 200 and etag_matches(request, etag):
        return Response(status_code=304, headers=headers)
    return HTMLResponse(content, status_code=status_code, headers=headers)
