import mimetypes
from pathlib import Path

MISSING_DIST_MESSAGE = (
    "The frontend is not built. Run `npm run build` in frontend/, then reload."
)
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff2": "font/woff2",
}
DEFAULT_STATIC_DIRECTORY = Path(__file__).resolve().parents[3] / "frontend" / "dist"


def default_static_directory() -> Path:
    return DEFAULT_STATIC_DIRECTORY


def content_type_of(path: Path) -> str:
    known = CONTENT_TYPES.get(path.suffix)
    if known is not None:
        return known
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def static_file(static_directory: Path, relative: str) -> Path | None:
    try:
        root = static_directory.resolve()
        candidate = (root / relative).resolve()
    except (OSError, ValueError):
        return None
    if candidate.suffix.lower() == ".map":
        return None
    if candidate.is_relative_to(root) and candidate.is_file():
        return candidate
    return None
