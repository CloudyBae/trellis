from fastapi.responses import Response
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from .responses import error_response

LOCAL_HOSTS = ("127.0.0.1", "localhost", "[::1]")
LOOPBACK_HOST = "127.0.0.1"


def is_local_origin(origin: str) -> bool:
    for scheme in ("http://", "https://"):
        if origin.startswith(scheme):
            authority = origin[len(scheme) :]
            for host in LOCAL_HOSTS:
                if authority == host:
                    return True
                port = authority.removeprefix(host + ":")
                if authority != port and port.isascii() and port.isdigit():
                    return True
    return False


class RequestGuard:
    def __init__(self, app: ASGIApp, *, allowed_hosts: frozenset[str] | None) -> None:
        self.app = app
        self.allowed_hosts = allowed_hosts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        refusal = self.refusal(scope["method"], Headers(scope=scope))
        if refusal is not None:
            await refusal(scope, receive, send)
            return
        await self.app(scope, receive, send)

    def refusal(self, method: str, headers: Headers) -> Response | None:
        if method == "POST":
            origin = headers.get("origin")
            if origin and not is_local_origin(origin):
                return error_response(403, "cross-origin posts are refused")
            return None
        if method not in ("GET", "HEAD"):
            return error_response(405, "method not allowed")
        if (
            self.allowed_hosts is not None
            and headers.get("host") not in self.allowed_hosts
        ):
            return error_response(403, "unexpected host")
        return None
