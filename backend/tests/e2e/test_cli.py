import asyncio
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
from pathlib import Path

import pytest
from typer.testing import CliRunner

from tests.scenario_data import load_case_table
from tests.support.network import LOOPBACK, free_port
from trellis.cli import commands, serve
from trellis.cli.discovery import (
    default_claude_dirs,
    default_codex_dirs,
    detected_vscode_dirs,
)
from trellis.cli.options import ServeOptions, since_ms
from trellis.cli.serve import build_runtime

BACKEND_DIRECTORY = Path(__file__).resolve().parents[2]
SINCE_FIXTURES = BACKEND_DIRECTORY / "tests" / "fixtures" / "cli" / "since"
runner = CliRunner()


class ServeRecorder:
    def __init__(self) -> None:
        self.calls: list[ServeOptions] = []

    def __call__(
        self, options: ServeOptions, static_directory: Path | None = None
    ) -> None:
        self.calls.append(options)


@pytest.fixture
def recorder(monkeypatch: pytest.MonkeyPatch) -> ServeRecorder:
    recording = ServeRecorder()
    monkeypatch.setattr(commands, "run_server", recording)
    return recording


def hook_cases() -> list[dict]:
    return load_case_table("hooks")["cases"]


@pytest.mark.parametrize("case", hook_cases(), ids=lambda case: " ".join(case["argv"]))
def test_hooks_output_matches_the_expected_output(case: dict) -> None:
    result = runner.invoke(commands.app, case["argv"])
    assert result.exit_code == 0
    assert result.stdout == case["stdout"]


def test_hooks_without_a_port_prints_the_default_port(recorder: ServeRecorder) -> None:
    result = runner.invoke(commands.app, ["hooks"])
    assert "http://127.0.0.1:4318/hooks/claude" in result.stdout
    assert recorder.calls == []


def startup_cases() -> list[dict]:
    return load_case_table("startup")["cases"]


@pytest.mark.parametrize(
    "case", startup_cases(), ids=lambda case: " ".join(case["argv"])
)
def test_startup_lines_match_the_expected_lines(case: dict, tmp_path: Path) -> None:
    port = free_port()
    home = tmp_path / "home"
    home.mkdir()
    environment = {
        name: value
        for name, value in os.environ.items()
        if name not in ("CODEX_HOME", "XDG_CONFIG_HOME", "APPDATA")
    }
    environment["HOME"] = str(home)
    argv = [part.replace("{port}", str(port)) for part in case["argv"]]
    process = subprocess.Popen(
        [sys.executable, "-m", "trellis", *argv],
        cwd=BACKEND_DIRECTORY,
        env=environment,
        stderr=subprocess.PIPE,
        text=True,
    )
    watchdog = threading.Timer(60, process.kill)
    watchdog.start()
    assert process.stderr is not None
    try:
        lines = [process.stderr.readline().rstrip("\n") for _ in case["lines"]]
        process.send_signal(signal.SIGINT)
        process.wait(timeout=15)
    finally:
        watchdog.cancel()
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stderr.close()
    assert lines == [line.replace("{port}", str(port)) for line in case["lines"]]


def since_scenario() -> dict:
    return load_case_table("since")


@pytest.mark.parametrize(
    "case", since_scenario()["cases"], ids=lambda case: case["since"]
)
def test_since_form_loads_the_expected_sessions(case: dict, tmp_path: Path) -> None:
    scenario = since_scenario()
    now = scenario["frozenNow"]
    root = tmp_path / "claude"
    shutil.copytree(SINCE_FIXTURES, root)
    for minutes in scenario["ageMinutes"]:
        seconds = (now - minutes * 60_000) / 1000
        os.utime(root / "-work-acme-api" / f"age-{minutes}.jsonl", (seconds, seconds))
    empty = tmp_path / "empty"
    empty.mkdir()
    options = ServeOptions(
        since=case["since"],
        sources=["claude"],
        claude_dirs=[str(root)],
        codex_dirs=[str(empty)],
        vscode_dirs=[str(empty)],
    )
    runtime = build_runtime(options, clock=lambda: now, log=lambda message: None)
    asyncio.run(runtime.run(runtime.scan_and_poll))
    runtime.executor.shutdown()
    loaded = sorted(
        int((session.raw_id or "").removeprefix("age-"))
        for session in runtime.store.list()
    )
    assert loaded == case["loaded"]


@pytest.mark.parametrize(
    ("text", "milliseconds"),
    [
        ("90m", 5_400_000),
        ("24h", 86_400_000),
        ("7d", 604_800_000),
        ("2", 7_200_000),
        ("1.5h", 5_400_000),
        ("90 m", 5_400_000),
        ("0", 0),
    ],
)
def test_since_ms_reads_the_valid_forms(text: str, milliseconds: float) -> None:
    assert since_ms(text) == milliseconds


def invalid_cases() -> list[dict]:
    return load_case_table("invalid")["cases"]


@pytest.mark.parametrize(
    "case", invalid_cases(), ids=lambda case: " ".join(case["argv"])
)
def test_invalid_port_or_since_exits_nonzero_with_a_message(
    case: dict, recorder: ServeRecorder
) -> None:
    result = runner.invoke(commands.app, case["argv"])
    assert result.exit_code != 0
    assert result.stderr.strip()
    assert recorder.calls == []
    if case["argv"][0] == "--since":
        assert case["nodeExitCode"] not in (0, None)


def test_defaults_match_the_documented_defaults(recorder: ServeRecorder) -> None:
    result = runner.invoke(commands.app, [])
    assert result.exit_code == 0
    assert recorder.calls == [
        ServeOptions(
            port=4318,
            host="127.0.0.1",
            since="24h",
            claude_dirs=[],
            codex_dirs=[],
            vscode_dirs=[],
            sources=["claude", "codex", "copilot"],
            open_browser=False,
        )
    ]


def test_every_flag_is_read(recorder: ServeRecorder) -> None:
    argv = [
        "-p",
        "4999",
        "--host",
        "0.0.0.0",
        "--since",
        "7d",
        "--claude-dir",
        "a",
        "--claude-dir",
        "b",
        "--codex-dir",
        "c",
        "--vscode-dir",
        "d",
        "--vscode-dir",
        "e",
        "--only",
        "codex,copilot",
        "--open",
    ]
    assert runner.invoke(commands.app, argv).exit_code == 0
    assert recorder.calls == [
        ServeOptions(
            port=4999,
            host="0.0.0.0",
            since="7d",
            claude_dirs=["a", "b"],
            codex_dirs=["c"],
            vscode_dirs=["d", "e"],
            sources=["codex", "copilot"],
            open_browser=True,
        )
    ]


def test_port_long_flag_and_zero_port(recorder: ServeRecorder) -> None:
    assert runner.invoke(commands.app, ["--port", "0"]).exit_code == 0
    assert recorder.calls[0].port == 0


def test_port_outside_the_range_is_refused(recorder: ServeRecorder) -> None:
    assert runner.invoke(commands.app, ["--port", "65536"]).exit_code != 0
    assert recorder.calls == []


@pytest.mark.parametrize("flag", ["-h", "--help"])
def test_help_flags_print_usage_and_do_not_serve(
    flag: str, recorder: ServeRecorder
) -> None:
    result = runner.invoke(commands.app, [flag])
    assert result.exit_code == 0
    assert "--claude-dir" in result.stdout
    assert "hooks" in result.stdout
    assert recorder.calls == []


def test_unknown_command_is_refused(recorder: ServeRecorder) -> None:
    result = runner.invoke(commands.app, ["frobnicate"])
    assert result.exit_code != 0
    assert recorder.calls == []


def test_default_folders_follow_home_and_codex_home(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("CODEX_HOME", raising=False)
    assert default_claude_dirs() == [str(tmp_path / ".claude" / "projects")]
    assert default_codex_dirs() == [str(tmp_path / ".codex" / "sessions")]
    monkeypatch.setenv("CODEX_HOME", str(tmp_path / "elsewhere"))
    assert default_codex_dirs() == [str(tmp_path / "elsewhere" / "sessions")]
    monkeypatch.setenv("CODEX_HOME", "")
    assert default_codex_dirs() == [str(tmp_path / ".codex" / "sessions")]


@pytest.mark.parametrize(
    ("platform", "environment", "base"),
    [
        ("darwin", {}, "Library/Application Support"),
        ("linux", {}, ".config"),
        ("linux", {"XDG_CONFIG_HOME": "xdg"}, "xdg"),
        ("win32", {"APPDATA": "roaming"}, "roaming"),
        ("win32", {}, "AppData/Roaming"),
    ],
)
def test_vscode_folders_are_detected_per_platform_and_only_when_present(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    platform: str,
    environment: dict[str, str],
    base: str,
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    environment = {name: str(tmp_path / value) for name, value in environment.items()}
    base_directory = tmp_path / base
    for flavor in ("Code", "Cursor"):
        (base_directory / flavor / "User").mkdir(parents=True)
    (base_directory / "Code - Insiders").mkdir()
    assert detected_vscode_dirs(platform, environment) == [
        str(base_directory / "Code" / "User"),
        str(base_directory / "Cursor" / "User"),
    ]


def test_an_occupied_port_is_reported_and_exits_with_one(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with socket.create_server((LOOPBACK, 0)) as occupied:
        port = occupied.getsockname()[1]
        with pytest.raises(SystemExit) as exit_info:
            serve.bind_listener(ServeOptions(port=port))
    assert exit_info.value.code == 1
    assert capsys.readouterr().err == (
        f"trellis: port {port} is in use (an OpenTelemetry collector?). "
        "Try --port 4319, and point OTLP exporters at that port.\n"
    )


@pytest.mark.parametrize(
    ("platform", "opener"),
    [("darwin", "open"), ("win32", "explorer"), ("linux", "xdg-open")],
)
def test_open_uses_the_platform_opener(
    monkeypatch: pytest.MonkeyPatch, platform: str, opener: str
) -> None:
    started: list[list[str]] = []
    monkeypatch.setattr(sys, "platform", platform)
    monkeypatch.setattr(
        serve.subprocess, "Popen", lambda command, **options: started.append(command)
    )
    serve.open_page("http://127.0.0.1:4318")
    assert started == [[opener, "http://127.0.0.1:4318"]]


def test_a_missing_opener_is_logged_not_raised(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def refuse(command: list[str], **options: object) -> None:
        raise FileNotFoundError("no opener")

    monkeypatch.setattr(serve.subprocess, "Popen", refuse)
    serve.open_page("http://127.0.0.1:4318")
    assert capsys.readouterr().err == "trellis: no opener\n"


def test_only_drops_duplicate_sources_keeping_first_appearance(
    recorder: ServeRecorder,
) -> None:
    runner.invoke(commands.app, ["--only", "codex,claude,codex,claude"])
    assert recorder.calls[0].sources == ["codex", "claude"]
