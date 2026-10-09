from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import Response
from starlette.exceptions import HTTPException

from ..runtime.runtime import Runtime
from . import static_files
from .guards import LOCAL_HOSTS, LOOPBACK_HOST, RequestGuard
from .intake import IntakeError
from .responses import error_response, not_found
from .routes import hooks, otlp, sessions
from .routes import static as static_routes


def create_app(
    *,
    runtime: Runtime,
    port: int,
    host: str,
    static_directory: Path | None = None,
) -> FastAPI:
    directory = (
        static_directory
        if static_directory is not None
        else static_files.default_static_directory()
    )
    allowed_hosts = (
        frozenset(f"{name}:{port}" for name in LOCAL_HOSTS)
        if host == LOOPBACK_HOST
        else None
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await runtime.start()
        try:
            yield
        finally:
            await runtime.stop()

    app = FastAPI(
        title="Trellis",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        redirect_slashes=False,
    )
    app.add_middleware(RequestGuard, allowed_hosts=allowed_hosts)

    @app.exception_handler(HTTPException)
    async def routing_error(request: Request, _: HTTPException) -> Response:
        return not_found(request.method)

    @app.exception_handler(IntakeError)
    async def intake_error(_: Request, error: IntakeError) -> Response:
        return error_response(error.status, error.message)

    app.include_router(sessions.create_router(runtime))
    app.include_router(otlp.create_router(runtime))
    app.include_router(hooks.create_router(runtime))
    app.include_router(static_routes.create_router(directory))

    return app
