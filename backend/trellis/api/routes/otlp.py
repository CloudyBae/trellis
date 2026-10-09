from collections.abc import Callable

from fastapi import APIRouter, Request
from fastapi.responses import Response

from ...runtime.runtime import Runtime
from .. import intake
from ..intake import accept_body, read_body
from ..models.errors import ERROR_RESPONSES
from ..models.responses import Accepted
from ..responses import error_response, respond


def create_router(runtime: Runtime) -> APIRouter:
    router = APIRouter()

    async def accept_otlp(
        request: Request, accept: Callable[[object], None]
    ) -> Response:
        if "protobuf" in request.headers.get("content-type", ""):
            return error_response(415, intake.PROTOBUF_MESSAGE)
        raw = await read_body(request, intake.OTLP_LIMIT)
        encoding = request.headers.get("content-encoding")
        await runtime.run(
            accept_body, raw, encoding, intake.OTLP_LIMIT, accept, runtime.log
        )
        return respond(200, "{}")

    @router.post("/v1/traces", response_model=Accepted, responses=ERROR_RESPONSES)
    async def traces(request: Request) -> Response:
        return await accept_otlp(request, runtime.accept_traces)

    @router.post("/v1/logs", response_model=Accepted, responses=ERROR_RESPONSES)
    async def logs(request: Request) -> Response:
        return await accept_otlp(request, runtime.accept_logs)

    @router.post("/v1/metrics", response_model=Accepted, responses=ERROR_RESPONSES)
    async def metrics(request: Request) -> Response:
        return await accept_otlp(request, lambda _: None)

    return router
