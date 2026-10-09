import zlib
from collections.abc import Callable

from fastapi import Request

from ..otlp.bodies import RejectedBody, parse_otlp_body
from ..runtime.sources import Log

OTLP_LIMIT = 32 * 1024 * 1024
HOOK_LIMIT = 4 * 1024 * 1024
PROTOBUF_MESSAGE = (
    "Trellis reads OTLP as JSON. Set OTEL_EXPORTER_OTLP_PROTOCOL=http/json "
    '(or protocol = "json" for Codex).'
)


class IntakeError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


async def read_body(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length", "")
    if declared.isascii() and declared.isdigit() and int(declared) > limit:
        raise IntakeError(413, "Payload too large")
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise IntakeError(413, "Payload too large")
        chunks.append(chunk)
    return b"".join(chunks)


def inflate(raw: bytes, window_bits: int, limit: int) -> bytes:
    decompressor = zlib.decompressobj(window_bits)
    try:
        data = decompressor.decompress(raw, limit + 1)
    except zlib.error as error:
        raise IntakeError(400, "body could not be decompressed") from error
    if len(data) > limit:
        raise IntakeError(413, "Payload too large")
    if not decompressor.eof:
        raise IntakeError(400, "body could not be decompressed")
    return data


def parse_body(raw: bytes, encoding: str | None, limit: int) -> object:
    if encoding == "gzip":
        raw = inflate(raw, zlib.MAX_WBITS | 16, limit)
    elif encoding == "deflate":
        raw = inflate(raw, zlib.MAX_WBITS, limit)
    text = raw.decode("utf-8", errors="replace")
    try:
        return parse_otlp_body(text or "{}")
    except ValueError as error:
        raise IntakeError(400, "body is not valid JSON") from error


def accept_body(
    raw: bytes,
    encoding: str | None,
    limit: int,
    accept: Callable[[object], None],
    log: Log,
) -> None:
    body = parse_body(raw, encoding, limit)
    try:
        accept(body)
    except RejectedBody as error:
        raise IntakeError(400, error.message) from error
    except Exception as error:
        log(f"intake failed: {type(error).__name__}")
        raise IntakeError(500, "internal error") from error
