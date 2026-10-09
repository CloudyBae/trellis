from fastapi import APIRouter, Request
from fastapi.responses import Response

from ...runtime.runtime import Runtime
from .. import intake
from ..intake import accept_body, read_body
from ..models.errors import ERROR_RESPONSES
from ..models.responses import Accepted
from ..responses import respond


def create_router(runtime: Runtime) -> APIRouter:
    router = APIRouter()

    @router.post("/hooks/claude", response_model=Accepted, responses=ERROR_RESPONSES)
    async def claude_hook(request: Request) -> Response:
        raw = await read_body(request, intake.HOOK_LIMIT)
        encoding = request.headers.get("content-encoding")
        await runtime.run(
            accept_body,
            raw,
            encoding,
            intake.HOOK_LIMIT,
            runtime.accept_hook,
            runtime.log,
        )
        return respond(200, "{}")

    return router
