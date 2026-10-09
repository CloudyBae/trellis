from fastapi.responses import Response

from ..util.json_text import js_json


def respond(
    status: int,
    body: str | bytes,
    content_type: str = "application/json",
    cache_control: str = "no-store",
) -> Response:
    return Response(
        content=body,
        status_code=status,
        headers={"content-type": content_type, "cache-control": cache_control},
    )


def error_response(status: int, message: str) -> Response:
    return respond(status, js_json({"error": message}))


def not_found(method: str) -> Response:
    if method == "POST":
        return error_response(404, "not found")
    return respond(404, "Not found", "text/plain")
