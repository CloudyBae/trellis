import errno
import socket
import subprocess
import sys
import time
from pathlib import Path

import uvicorn

from ..api.app import create_app
from ..hosts.claude import ClaudeSource
from ..hosts.codex import CodexSource
from ..hosts.copilot import CopilotSource
from ..otlp.source import OtlpSource
from ..runtime.runtime import Runtime
from ..runtime.sources import Clock, Log, TranscriptSource
from ..runtime.store import Store
from .discovery import default_claude_dirs, default_codex_dirs, detected_vscode_dirs
from .options import ServeOptions, since_ms


def write_log(message: str) -> None:
    sys.stderr.write(f"trellis: {message}\n")
    sys.stderr.flush()


def wall_clock() -> float:
    return time.time_ns() // 1_000_000


def build_runtime(options: ServeOptions, *, clock: Clock, log: Log) -> Runtime:
    store = Store()
    since = since_ms(options.since)
    sources: list[TranscriptSource] = []
    claude_source: ClaudeSource | None = None
    if "claude" in options.sources:
        claude_source = ClaudeSource(
            roots=options.claude_dirs or default_claude_dirs(),
            since_ms=since,
            store=store,
            log=log,
            clock=clock,
        )
        sources.append(claude_source)
    if "codex" in options.sources:
        sources.append(
            CodexSource(
                roots=options.codex_dirs or default_codex_dirs(),
                since_ms=since,
                store=store,
                log=log,
                clock=clock,
            )
        )
    if "copilot" in options.sources:
        sources.append(
            CopilotSource(
                roots=options.vscode_dirs or detected_vscode_dirs(),
                since_ms=since,
                store=store,
                log=log,
                clock=clock,
            )
        )
    otlp = OtlpSource(since_ms=since, store=store, clock=clock, log=log)
    return Runtime(
        store=store,
        sources=sources,
        otlp=otlp,
        source_names=options.sources,
        log=log,
        hook_handler=claude_source.hook if claude_source is not None else None,
    )


def open_page(url: str) -> None:
    if sys.platform == "darwin":
        opener = "open"
    elif sys.platform == "win32":
        opener = "explorer"
    else:
        opener = "xdg-open"
    try:
        subprocess.Popen(
            [opener, url],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError as error:
        write_log(str(error))


class AnnouncingServer(uvicorn.Server):
    def __init__(self, config: uvicorn.Config, options: ServeOptions, runtime: Runtime):
        super().__init__(config)
        self.options = options
        self.runtime = runtime

    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        await super().startup(sockets=sockets)
        if self.started:
            self.announce()

    def announce(self) -> None:
        options = self.options
        shown_host = "127.0.0.1" if options.host == "0.0.0.0" else options.host
        url = f"http://{shown_host}:{options.port}"
        write_log(
            f"watching {', '.join(options.sources)} (last {options.since}); "
            f"{self.runtime.session_count()} session(s) so far"
        )
        write_log(f"open {url}   ·   OTLP/HTTP JSON at {url}/v1/traces and /v1/logs")
        if options.open_browser:
            open_page(url)


def bind_listener(options: ServeOptions) -> socket.socket:
    family = socket.AF_INET6 if ":" in options.host else socket.AF_INET
    try:
        return socket.create_server((options.host, options.port), family=family)
    except OSError as error:
        if error.errno == errno.EADDRINUSE:
            write_log(
                f"port {options.port} is in use (an OpenTelemetry collector?). "
                "Try --port 4319, and point OTLP exporters at that port."
            )
        else:
            write_log(str(error))
        raise SystemExit(1) from error


def run_server(options: ServeOptions, static_directory: Path | None = None) -> None:
    listener = bind_listener(options)
    runtime = build_runtime(options, clock=wall_clock, log=write_log)
    application = create_app(
        runtime=runtime,
        port=options.port,
        host=options.host,
        static_directory=static_directory,
    )
    config = uvicorn.Config(
        application,
        host=options.host,
        port=options.port,
        log_level="warning",
        access_log=False,
        timeout_graceful_shutdown=1,
    )
    AnnouncingServer(config, options, runtime).run(sockets=[listener])
