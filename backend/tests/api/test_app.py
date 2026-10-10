import asyncio
import base64
import gzip
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import zlib
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.scenario_data import CASES_DIRECTORY, load_case_table, load_scenario
from tests.support.network import LOOPBACK, free_port
from trellis.api import intake, static_files
from trellis.api.app import create_app
from trellis.api.guards import is_local_origin
from trellis.api.intake import HOOK_LIMIT
from trellis.api.static_files import default_static_directory
from trellis.cli.options import ServeOptions
from trellis.cli.serve import build_runtime
from trellis.runtime.runtime import Runtime

BACKEND_DIRECTORY = Path(__file__).resolve().parents[2]
REPOSITORY_DIRECTORY = BACKEND_DIRECTORY.parent
FIXTURE_DIRECTORY = BACKEND_DIRECTORY / "tests" / "fixtures" / "claude"
FROZEN_NOW = load_scenario("claude", "finished")["now"]
PORT = 4318
HTML = "<!doctype html><html><head><title>Trellis</title></head><body></body></html>"
SETTLE_SECONDS = 5.0
SERVER_SCRIPT = (
    "import json, sys\n"
    "from pathlib import Path\n"
    "from trellis.cli.options import ServeOptions\n"
    "from trellis.cli.serve import run_server\n"
    "run_server(ServeOptions(**json.loads(sys.argv[1])), Path(sys.argv[2]))\n"
)


def scenario_cases(evidence_only: bool) -> list[str]:
    result = []
    for path in CASES_DIRECTORY.glob("*.json"):
        case_data = json.loads(path.read_text("utf-8"))
        if case_data.get("evidenceOnly") == evidence_only:
            result.append(path.stem)
    return sorted(result)


def make_runtime(tmp_path: Path, logs: list[str] | None = None) -> Runtime:
    empty = tmp_path / "empty"
    empty.mkdir(exist_ok=True)
    options = ServeOptions(
        since="7d",
        claude_dirs=[str(empty)],
        codex_dirs=[str(empty)],
        vscode_dirs=[str(empty)],
    )
    log = logs.append if logs is not None else (lambda message: None)
    runtime = build_runtime(options, clock=lambda: FROZEN_NOW, log=log)
    runtime.poll_interval = 3600
    runtime.scan_interval = 3600
    return runtime


def make_app(
    tmp_path: Path,
    *,
    host: str = LOOPBACK,
    static_directory: Path | None = None,
) -> FastAPI:
    return create_app(
        runtime=make_runtime(tmp_path),
        port=PORT,
        host=host,
        static_directory=static_directory,
    )


def make_dist(tmp_path: Path) -> Path:
    dist = tmp_path / "site" / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(HTML, "utf-8")
    (dist / "assets" / "app.js").write_text("export const ready = true;", "utf-8")
    (dist / "assets" / "app.js.map").write_text("{}", "utf-8")
    (dist / "assets" / "app.js.MAP").write_text("{}", "utf-8")
    (dist / "fonts").mkdir()
    (dist / "fonts" / "body.woff2").write_bytes(b"wOF2")
    (tmp_path / "site" / "DESIGN.md").write_text("private", "utf-8")
    (tmp_path / "site" / "secret.txt").write_text("secret", "utf-8")
    return dist


def request_body(spec: dict | None) -> bytes | None:
    if spec is None:
        return None
    if "text" in spec:
        return spec["text"].encode("utf-8")
    if "base64" in spec:
        return base64.b64decode(spec["base64"])
    return spec["repeat"].encode("utf-8") * spec["count"]


def without_completeness_anywhere(value: object) -> object:
    if isinstance(value, dict):
        return {
            key: without_completeness_anywhere(item)
            for key, item in value.items()
            if key != "completeness"
        }
    if isinstance(value, list):
        return [without_completeness_anywhere(item) for item in value]
    return value


def logs_body(session: str, at_ms: int, prompt: str = "Hello") -> dict:
    attributes = {
        "event.name": "claude_code.user_prompt",
        "session.id": session,
        "prompt": prompt,
    }
    return {
        "resourceLogs": [
            {
                "resource": {
                    "attributes": [
                        {"key": "service.name", "value": {"stringValue": "claude-code"}}
                    ]
                },
                "scopeLogs": [
                    {
                        "logRecords": [
                            {
                                "timeUnixNano": str(at_ms * 1_000_000),
                                "attributes": [
                                    {"key": key, "value": {"stringValue": value}}
                                    for key, value in attributes.items()
                                ],
                            }
                        ]
                    }
                ],
            }
        ]
    }


def body_of_size(size: int) -> bytes:
    prefix = b'{"pad":"'
    suffix = b'"}'
    return prefix + b"x" * (size - len(prefix) - len(suffix)) + suffix


@pytest.fixture
def client(tmp_path: Path):
    with TestClient(make_app(tmp_path)) as test_client:
        yield test_client


@pytest.mark.parametrize("case", scenario_cases(evidence_only=False))
def test_http_case_matches_its_expected_response(case: str, tmp_path: Path) -> None:
    scenario = load_case_table(case)
    application = make_app(tmp_path, host=scenario["bindHost"])
    with TestClient(application) as test_client:
        for request, expected in zip(scenario["requests"], scenario["responses"]):
            headers = {"host": f"{LOOPBACK}:{{port}}"}
            headers.update(request.get("headers", {}))
            headers = {
                name: value.replace("{port}", str(PORT))
                for name, value in headers.items()
            }
            response = test_client.request(
                request["method"],
                request["path"],
                headers=headers,
                content=request_body(request.get("body")),
            )
            label = f"{case}: {request['method']} {request['path']}"
            assert response.status_code == expected["status"], label
            assert response.headers["content-type"] == expected["contentType"], label
            if request["method"] == "HEAD":
                continue
            if "keys" in expected:
                assert sorted(response.json()) == expected["keys"], label
            elif "text" in expected:
                assert response.text == expected["text"], label
            elif expected["contentType"] == "application/json":
                assert (
                    without_completeness_anywhere(response.json()) == expected["body"]
                ), label
            else:
                assert response.text == expected["body"], label


def test_oversized_hook_case_is_recorded_as_evidence_only() -> None:
    assert scenario_cases(evidence_only=True) == ["oversized_hook"]


def test_body_at_the_limit_is_accepted_and_one_byte_more_is_refused(
    client: TestClient,
) -> None:
    headers = {"host": f"{LOOPBACK}:{PORT}"}
    at_limit = client.post(
        "/hooks/claude", content=body_of_size(HOOK_LIMIT), headers=headers
    )
    over_limit = client.post(
        "/hooks/claude", content=body_of_size(HOOK_LIMIT + 1), headers=headers
    )
    assert at_limit.status_code == 200
    assert over_limit.status_code == 413
    assert list(over_limit.json()) == ["error"]


@pytest.mark.parametrize("compress", [gzip.compress, zlib.compress])
def test_compressed_body_that_expands_past_the_limit_is_refused(
    client: TestClient, compress
) -> None:
    encoding = "gzip" if compress is gzip.compress else "deflate"
    headers = {"host": f"{LOOPBACK}:{PORT}", "content-encoding": encoding}
    bomb = compress(body_of_size(HOOK_LIMIT + 1))
    assert len(bomb) < 64 * 1024
    refused = client.post("/hooks/claude", content=bomb, headers=headers)
    accepted = client.post(
        "/hooks/claude", content=compress(body_of_size(HOOK_LIMIT)), headers=headers
    )
    assert refused.status_code == 413
    assert accepted.status_code == 200


def test_otlp_routes_apply_the_limit_to_the_decompressed_size(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(intake, "OTLP_LIMIT", 2048)
    headers = {"host": f"{LOOPBACK}:{PORT}", "content-encoding": "gzip"}
    for route in ("/v1/traces", "/v1/logs", "/v1/metrics"):
        plain = client.post(
            route, content=body_of_size(2049), headers={"host": headers["host"]}
        )
        bomb = client.post(
            route, content=gzip.compress(body_of_size(2049)), headers=headers
        )
        assert (plain.status_code, bomb.status_code) == (413, 413), route


def test_streamed_body_is_refused_without_reading_all_of_it(tmp_path: Path) -> None:
    chunk = b"x" * (1024 * 1024)
    total_chunks = 12
    remaining = [
        {"type": "http.request", "body": chunk, "more_body": True}
    ] * total_chunks
    consumed = 0
    sent: list[dict] = []

    async def receive() -> dict:
        nonlocal consumed
        if not remaining:
            return {"type": "http.request", "body": b"", "more_body": False}
        consumed += 1
        return remaining.pop()

    async def send(message: dict) -> None:
        sent.append(message)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/hooks/claude",
        "raw_path": b"/hooks/claude",
        "query_string": b"",
        "headers": [(b"host", f"{LOOPBACK}:{PORT}".encode())],
        "http_version": "1.1",
        "scheme": "http",
        "client": ("127.0.0.1", 1),
        "server": ("127.0.0.1", PORT),
    }
    asyncio.run(make_app(tmp_path)(scope, receive, send))
    status = next(
        message["status"]
        for message in sent
        if message["type"] == "http.response.start"
    )
    assert status == 413
    assert consumed <= HOOK_LIMIT // len(chunk) + 1 < total_chunks


def test_sessions_body_equals_the_list_assembled_from_session_events(
    tmp_path: Path,
) -> None:
    runtime = make_runtime(tmp_path)
    runtime.hub.flush_delay = 0.01
    application = create_app(runtime=runtime, port=PORT, host=LOOPBACK)

    async def scenario() -> None:
        transport = httpx.ASGITransport(app=application)
        async with httpx.AsyncClient(
            transport=transport, base_url=f"http://{LOOPBACK}:{PORT}"
        ) as web:
            await runtime.start()
            stream = runtime.hub.stream()
            hello = await asyncio.wait_for(anext(stream), SETTLE_SECONDS)
            assert hello == 'event: hello\ndata: {"sessions":[]}\n\n'
            for name, at_ms in (
                ("first", FROZEN_NOW - 9000),
                ("second", FROZEN_NOW - 1000),
            ):
                reply = await web.post(
                    "/v1/logs", json=logs_body(name, at_ms, f"Prompt {name}")
                )
                assert reply.status_code == 200
            payloads: dict[str, str] = {}
            while len(payloads) < 2:
                message = await asyncio.wait_for(anext(stream), SETTLE_SECONDS)
                data = message.split("data: ", 1)[1].removesuffix("\n\n")
                payloads[json.loads(data)["id"]] = data
            listing = await web.get("/api/sessions")
            ids = [session["id"] for session in listing.json()]
            assert ids == ["otel-log:second", "otel-log:first"]
            assert listing.text == "[" + ",".join(payloads[name] for name in ids) + "]"
            late = runtime.hub.stream()
            late_hello = await asyncio.wait_for(anext(late), SETTLE_SECONDS)
            assert (
                late_hello == f'event: hello\ndata: {{"sessions":{listing.text}}}\n\n'
            )
            await stream.aclose()
            await late.aclose()
            await runtime.stop()

    asyncio.run(scenario())


def test_static_files_come_from_dist_only(tmp_path: Path) -> None:
    dist = make_dist(tmp_path)
    with TestClient(make_app(tmp_path, static_directory=dist)) as web:
        headers = {"host": f"{LOOPBACK}:{PORT}"}
        page = web.get("/", headers=headers)
        assert page.status_code == 200
        assert page.headers["content-type"] == "text/html; charset=utf-8"
        assert "<title>Trellis</title>" in page.text
        assert web.get("/index.html", headers=headers).text == page.text
        script = web.get("/assets/app.js", headers=headers)
        assert script.status_code == 200
        assert script.headers["content-type"].startswith("text/javascript")
        assert script.headers["cache-control"] == "no-cache"
        font = web.get("/fonts/body.woff2", headers=headers)
        assert (font.status_code, font.headers["content-type"]) == (200, "font/woff2")
        for refused in (
            "/DESIGN.md",
            "/assets/app.js.map",
            "/assets/app.js.map/",
            "/assets/app.js.MAP",
            "/assets/app.js.Map/",
            "/assets",
            "/assets/",
            "/%2e%2e/secret.txt",
            "/assets/%2e%2e/%2e%2e/secret.txt",
            "/..%2fsecret.txt",
            "//etc/passwd",
            "/assets/app.js%00",
        ):
            response = web.get(refused, headers=headers)
            assert (response.status_code, response.text) == (404, "Not found"), refused
            assert response.headers["content-type"] == "text/plain"


def test_a_symlink_out_of_dist_is_not_served(tmp_path: Path) -> None:
    dist = make_dist(tmp_path)
    (dist / "escape.txt").symlink_to(tmp_path / "site" / "secret.txt")
    with TestClient(make_app(tmp_path, static_directory=dist)) as web:
        response = web.get("/escape.txt", headers={"host": f"{LOOPBACK}:{PORT}"})
    assert response.status_code == 404


def test_missing_dist_gives_503_on_the_page_and_keeps_the_api_working(
    tmp_path: Path,
) -> None:
    missing = tmp_path / "no-dist"
    headers = {"host": f"{LOOPBACK}:{PORT}"}
    with TestClient(make_app(tmp_path, static_directory=missing)) as web:
        for route in ("/", "/index.html"):
            page = web.get(route, headers=headers)
            assert page.status_code == 503
            assert page.headers["content-type"] == "text/plain"
            assert "npm run build" in page.text
        assert web.get("/assets/app.js", headers=headers).status_code == 404
        assert web.get("/api/health", headers=headers).status_code == 200
        assert web.get("/api/sessions", headers=headers).json() == []


def test_dist_without_an_index_page_gives_503(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    with TestClient(make_app(tmp_path, static_directory=dist)) as web:
        assert web.get("/", headers={"host": f"{LOOPBACK}:{PORT}"}).status_code == 503


def test_default_static_directory_is_the_same_from_any_working_directory() -> None:
    expected = REPOSITORY_DIRECTORY / "frontend" / "dist"
    environment = {**os.environ, "PYTHONPATH": str(BACKEND_DIRECTORY)}
    program = "from trellis.api.static_files import default_static_directory; print(default_static_directory())"
    for working_directory in (BACKEND_DIRECTORY, REPOSITORY_DIRECTORY):
        result = subprocess.run(
            [sys.executable, "-c", program],
            cwd=working_directory,
            env=environment,
            capture_output=True,
            text=True,
            check=True,
        )
        assert Path(result.stdout.strip()) == expected
    assert default_static_directory() == expected


def test_app_without_a_static_directory_serves_the_default_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dist = make_dist(tmp_path)
    monkeypatch.setattr(static_files, "CHECKOUT_STATIC_DIRECTORY", dist)
    with TestClient(make_app(tmp_path)) as web:
        assert (
            "<title>Trellis</title>"
            in web.get("/", headers={"host": f"{LOOPBACK}:{PORT}"}).text
        )


@pytest.mark.parametrize(
    ("origin", "local"),
    [
        ("http://127.0.0.1", True),
        ("https://localhost", True),
        ("http://localhost:5173", True),
        ("http://[::1]:5173", True),
        ("http://localhost:", False),
        ("http://localhost:٣", False),
        ("http://localhost:80a", False),
        ("http://localhost.evil.example", False),
        ("http://localhostx", False),
        ("http://127.0.0.1/", False),
        ("HTTP://localhost", False),
        ("ftp://localhost", False),
        ("localhost", False),
        ("null", False),
    ],
)
def test_origin_check_accepts_only_local_http_origins(origin: str, local: bool) -> None:
    assert is_local_origin(origin) is local


def test_openapi_schema_declares_session_and_event_models(client: TestClient) -> None:
    schema = client.get("/openapi.json", headers={"host": f"{LOOPBACK}:{PORT}"}).json()
    components = schema["components"]["schemas"]
    for name in (
        "Session",
        "Agent",
        "Run",
        "Phase",
        "ToolTurn",
        "HelloEvent",
        "SessionEvent",
        "RemoveEvent",
    ):
        assert name in components, name
    assert {"rawId", "endAt"} <= set(components["Session"]["properties"])
    assert "completeness" in components["Agent"]["required"]
    stream = schema["paths"]["/api/stream"]["get"]["responses"]["200"]["content"]
    refs = {
        entry["$ref"].rsplit("/", 1)[1]
        for entry in stream["text/event-stream"]["schema"]["anyOf"]
    }
    assert refs == {"HelloEvent", "SessionEvent", "RemoveEvent"}


def test_every_json_route_declares_a_response_model(client: TestClient) -> None:
    schema = client.get("/openapi.json", headers={"host": f"{LOOPBACK}:{PORT}"}).json()
    json_routes = {
        ("/api/health", "get"),
        ("/api/sessions", "get"),
        ("/v1/traces", "post"),
        ("/v1/logs", "post"),
        ("/v1/metrics", "post"),
        ("/hooks/claude", "post"),
    }
    assert {
        (path, method)
        for path, operations in schema["paths"].items()
        for method in operations
    } == json_routes | {("/api/stream", "get")}
    for path, method in json_routes:
        content = schema["paths"][path][method]["responses"]["200"]["content"]
        assert content["application/json"]["schema"], (path, method)
    listing = schema["paths"]["/api/sessions"]["get"]["responses"]["200"]["content"]
    assert listing["application/json"]["schema"]["items"] == {
        "$ref": "#/components/schemas/Session"
    }


def start_server(tmp_path: Path, dist: Path, port: int) -> subprocess.Popen[str]:
    claude = tmp_path / "claude"
    shutil.copytree(FIXTURE_DIRECTORY / "finished", claude)
    empty = tmp_path / "empty"
    empty.mkdir()
    options = ServeOptions(
        port=port,
        since="36500d",
        claude_dirs=[str(claude)],
        codex_dirs=[str(empty)],
        vscode_dirs=[str(empty)],
    )
    process = subprocess.Popen(
        [sys.executable, "-c", SERVER_SCRIPT, json.dumps(options.__dict__), str(dist)],
        cwd=BACKEND_DIRECTORY,
        stderr=subprocess.PIPE,
        text=True,
    )
    watchdog = threading.Timer(60, process.kill)
    watchdog.start()
    assert process.stderr is not None
    lines = []
    while not lines or "open http" not in lines[-1]:
        line = process.stderr.readline()
        assert line, f"server exited early: {lines}"
        lines.append(line)
    watchdog.cancel()
    return process


def test_real_server_serves_page_sessions_stream_and_intake(tmp_path: Path) -> None:
    dist = make_dist(tmp_path)
    port = free_port()
    base = f"http://{LOOPBACK}:{port}"
    process = start_server(tmp_path, dist, port)
    try:
        page = httpx.get(base + "/")
        assert page.status_code == 200
        assert "<title>Trellis</title>" in page.text
        assert httpx.get(base + "/DESIGN.md").status_code == 404
        head = httpx.head(base + "/api/health")
        assert (head.status_code, head.content) == (200, b"")
        sessions = httpx.get(base + "/api/sessions").json()
        assert len(sessions) == 1
        assert len(sessions[0]["agents"]) == 3
        assert httpx.get(base + "/api/health").json() == {
            "ok": True,
            "sources": ["claude", "codex", "copilot"],
            "sessions": 1,
        }

        with httpx.stream(
            "GET", base + "/api/stream", timeout=SETTLE_SECONDS
        ) as stream:
            assert stream.headers["content-type"] == "text/event-stream"
            lines = stream.iter_lines()
            assert next(lines) == "event: hello"
            hello = json.loads(next(lines).removeprefix("data: "))
            assert [session["id"] for session in hello["sessions"]] == [
                sessions[0]["id"]
            ]
            posted = httpx.post(
                base + "/v1/logs",
                json=logs_body("remote-1", FROZEN_NOW, "From a container"),
            )
            assert posted.status_code == 200
            event = None
            for line in lines:
                if line.startswith("event: "):
                    event = line
                if line.startswith('data: {"id":"otel-log:remote-1"'):
                    break
            assert event == "event: session"

            assert (
                httpx.post(
                    base + "/v1/traces",
                    content=b"x",
                    headers={"content-type": "application/x-protobuf"},
                ).status_code
                == 415
            )
            assert (
                httpx.post(
                    base + "/hooks/claude",
                    content=b"{}",
                    headers={"origin": "https://evil.example"},
                ).status_code
                == 403
            )
            hook = httpx.post(
                base + "/hooks/claude",
                json={"session_id": sessions[0]["rawId"], "hook_event_name": "Stop"},
            )
            assert hook.status_code == 200
            process.send_signal(signal.SIGINT)
            assert process.wait(timeout=15) in (0, -signal.SIGINT)
    finally:
        if process.poll() is None:
            process.kill()
        process.wait()
        if process.stderr is not None:
            process.stderr.close()
