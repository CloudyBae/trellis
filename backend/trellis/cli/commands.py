from typing import Annotated

import typer

from .hook_settings import hooks_snippet
from .options import (
    DEFAULT_HOST,
    DEFAULT_PORT,
    DEFAULT_SINCE,
    DEFAULT_SOURCES,
    ServeOptions,
    since_ms,
)
from .serve import run_server


app = typer.Typer(
    add_completion=False,
    pretty_exceptions_enable=False,
    context_settings={"help_option_names": ["-h", "--help"]},
    help="Watch your agents work. Run with no command to start Trellis.",
)

PortOption = Annotated[
    int,
    typer.Option(
        "--port",
        "-p",
        min=0,
        max=65535,
        help="Port for the page, the API and the OTLP receiver.",
    ),
]


@app.callback(invoke_without_command=True)
def main(
    context: typer.Context,
    port: PortOption = DEFAULT_PORT,
    host: Annotated[
        str,
        typer.Option(
            "--host",
            help="Interface to bind. Use 0.0.0.0 only to receive OTLP from containers.",
        ),
    ] = DEFAULT_HOST,
    since: Annotated[
        str,
        typer.Option("--since", help="How far back to load sessions: 90m, 24h, 7d."),
    ] = DEFAULT_SINCE,
    claude_dir: Annotated[
        list[str] | None,
        typer.Option("--claude-dir", help="Claude Code projects folder. Repeatable."),
    ] = None,
    codex_dir: Annotated[
        list[str] | None,
        typer.Option("--codex-dir", help="Codex sessions folder. Repeatable."),
    ] = None,
    vscode_dir: Annotated[
        list[str] | None,
        typer.Option(
            "--vscode-dir", help="VS Code user folder for Copilot chats. Repeatable."
        ),
    ] = None,
    only: Annotated[
        str | None,
        typer.Option(
            "--only", help="Sources to read, comma separated: claude, codex, copilot."
        ),
    ] = None,
    open_browser: Annotated[
        bool, typer.Option("--open", help="Open the page in your browser.")
    ] = False,
) -> None:
    options = ServeOptions(
        port=port,
        host=host,
        since=since,
        claude_dirs=claude_dir or [],
        codex_dirs=codex_dir or [],
        vscode_dirs=vscode_dir or [],
        sources=list(DEFAULT_SOURCES)
        if only is None
        else list(dict.fromkeys(only.split(","))),
        open_browser=open_browser,
    )
    if context.invoked_subcommand is not None:
        context.obj = options
        return
    try:
        since_ms(options.since)
    except ValueError as error:
        raise typer.BadParameter(str(error), param_hint="--since") from error
    run_server(options)


@app.command(help="Print Claude Code hook settings for live blocked and idle state.")
def hooks(
    context: typer.Context,
    port: Annotated[
        int | None,
        typer.Option("--port", "-p", min=0, max=65535, help="Port Trellis listens on."),
    ] = None,
) -> None:
    inherited: ServeOptions = context.obj
    typer.echo(hooks_snippet(inherited.port if port is None else port))


def run() -> None:
    app()
