from fastapi import APIRouter
from fastapi.responses import Response, StreamingResponse

from ...runtime.runtime import Runtime
from ...sessions.models import Session
from ...util.json_text import js_json
from ..models.events import HelloEvent, RemoveEvent, SessionEvent
from ..models.responses import Health
from ..responses import respond


class EventStream(StreamingResponse):
    media_type = "text/event-stream"


def create_router(runtime: Runtime) -> APIRouter:
    router = APIRouter()

    @router.get("/api/health", response_model=Health)
    @router.head("/api/health", include_in_schema=False)
    async def health() -> Response:
        return respond(
            200,
            js_json(
                {
                    "ok": True,
                    "sources": runtime.source_names,
                    "sessions": runtime.session_count(),
                }
            ),
        )

    @router.get("/api/sessions", response_model=list[Session])
    @router.head("/api/sessions", include_in_schema=False)
    async def sessions() -> Response:
        return respond(200, runtime.hub.sessions_json())

    @router.get(
        "/api/stream",
        response_class=EventStream,
        responses={200: {"model": HelloEvent | SessionEvent | RemoveEvent}},
    )
    async def stream() -> Response:
        return EventStream(
            runtime.hub.stream(),
            headers={"content-type": "text/event-stream", "cache-control": "no-store"},
        )

    return router
