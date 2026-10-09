from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import Response

from ..responses import not_found, respond
from ..static_files import MISSING_DIST_MESSAGE, content_type_of, static_file


def create_router(directory: Path) -> APIRouter:
    router = APIRouter()

    @router.get("/{path:path}", include_in_schema=False)
    @router.head("/{path:path}", include_in_schema=False)
    def static(path: str) -> Response:
        relative = path or "index.html"
        found = static_file(directory, relative)
        if found is not None:
            return respond(200, found.read_bytes(), content_type_of(found), "no-cache")
        if relative == "index.html":
            return respond(503, MISSING_DIST_MESSAGE, "text/plain")
        return not_found("GET")

    return router
