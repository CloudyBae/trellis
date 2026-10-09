# Trellis

A quiet garden where you can watch your agents work. Trellis reads the session files that Claude Code, Codex and GitHub Copilot already write on your machine, optionally receives OpenTelemetry and Claude Code hooks, and draws each run as a delegation tree that updates live.

## Run it

Requires Python 3.11 or later with [uv](https://docs.astral.sh/uv/), and Node with npm to build the page once. The backend dependencies are pinned in `backend/pyproject.toml` and the page is built into `frontend/dist`, which the server serves.

```sh
(cd backend && uv sync)
(cd frontend && npm ci && npm run build)
uv run --project backend --directory backend python -m trellis --open
```

The page is at http://127.0.0.1:4318. Sessions active in the last 24 hours load automatically (`--since 7d` to go further back). If `frontend/dist` has not been built, `/` answers 503 with the build command. The synthetic demo runs are available at `/?demo`, or from the "Watch a demo run" button on the empty page. Opening the built page from disk as a `file://` URL no longer shows the demo.

Pass options after `python -m trellis`. `python -m trellis --help` lists them.

| Option | |
|---|---|
| `--port N` | Port for the page, the API and the OTLP receiver (default 4318, the standard OTLP/HTTP port) |
| `--since 24h` | How far back to load sessions (`90m`, `24h`, `7d`) |
| `--only claude,codex,copilot` | Limit which session files are read |
| `--claude-dir`, `--codex-dir`, `--vscode-dir` | Non-default locations (repeatable) |
| `--host 0.0.0.0` | Only if containers need to send OTLP; the default binds to this machine only |

## What it reads

| Source | Where | What it gives |
|---|---|---|
| **Claude Code transcripts** (JSONL) | `~/.claude/projects/<project>/<session>.jsonl` and `<session>/subagents/agent-*.jsonl` + `.meta.json` | The full tree: each subagent's `meta.json` names the `Agent` tool call that spawned it, so delegation, handoff prompt, tool calls with timings and output, and the returned result are exact. |
| **Claude Code hooks** (recommended) | POSTs to `/hooks/claude` | What transcripts can't show: a **permission prompt waiting on you** (blocked), the end of a turn, and the end of a session. |
| **Codex rollouts** (JSONL) | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Prompts, messages, shell/patch calls with exit codes and durations, approval requests. Rollouts that name a parent thread are drawn as its subagents. |
| **Copilot chats** (JSON / JSONL) | VS Code `workspaceStorage/*/chatSessions/` | Requests, tool invocations and `runSubagent` children. VS Code records one time per request, so steps inside a request are spaced evenly, and the pane says so. |
| **OTLP traces** (JSON) | `POST /v1/traces` | Any agent that follows the OpenTelemetry GenAI conventions: `invoke_agent` spans become agents, span parentage becomes delegation, `execute_tool` spans become tool calls. |
| **OTLP logs** (JSON) | `POST /v1/logs` | `claude_code.*` and `codex.*` events (prompts, tool results, rejected tools, API errors). There is no hierarchy, so a log-only session is one agent. |

When a transcript and OpenTelemetry describe the same session, the transcript wins, because it is richer. OpenTelemetry is most useful for agents running somewhere Trellis can't read files from, such as a container, a devbox or CI.

### How each state is decided

- **running**: the agent has started and not returned.
- **waiting**: it has subagents still out, or the main agent finished its turn and is waiting for your next message.
- **blocked**: a permission prompt is open. Transcripts don't record this, so it comes from the Claude Code hook or a Codex approval request. Without hooks, Trellis shows the tool as pending rather than guessing.
- **failed**: the spawning tool call returned an error, or the span ended with an error status.
- **complete**: the agent returned.

A session counts as live while its files changed in the last 10 minutes, or in the last hour when a tool is still running. The `SessionEnd` hook ends it immediately.

## Recommended setup

### 1. Claude Code hooks (for the blocked state)

```sh
uv run --project backend --directory backend python -m trellis hooks
```

This prints a `hooks` block to merge into `~/.claude/settings.json`, or into a project's `.claude/settings.json`. Each hook runs `curl` with a 2-second timeout and always exits 0, so Claude Code keeps working normally when Trellis isn't running. If you use a different `--port`, pass the same port to `hooks`.

### 2. OpenTelemetry (optional)

Trellis accepts OTLP over HTTP with **JSON** encoding. Protobuf is refused with a 415 that explains the fix.

**Claude Code:**
```sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
export OTEL_LOG_USER_PROMPTS=1
```

`OTEL_LOG_USER_PROMPTS` is optional. Without it, prompts arrive redacted.

**Codex** (`~/.codex/config.toml`). Check the key names against your Codex version's docs:
```toml
[otel]
exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/logs", protocol = "json" } }
log_user_prompt = true
```

**Anything else**, including Copilot builds or your own agents: point an OTLP/HTTP JSON exporter at `http://127.0.0.1:4318` and emit GenAI semantic-convention spans (`gen_ai.operation.name` = `invoke_agent` / `execute_tool`, plus `gen_ai.agent.name`, `gen_ai.conversation.id`, `gen_ai.tool.name`, `gen_ai.tool.call.arguments`).

If port 4318 is already taken by a collector, run Trellis on `--port 4319` and add it as a second exporter destination in the collector.

## Privacy

Everything stays on this machine. The server binds to `127.0.0.1`, serves only the files under `frontend/dist` (the page, its scripts, styles and fonts), refuses page and API requests addressed to any other host name, and refuses posts from other web origins. Transcripts are read, never modified.

## What is verified

- **Backend**: `backend/tests/` (pytest) covers the parsers, the session model, the store and event stream, the CLI and the HTTP routes. Expected session JSON is kept as payload snapshots in `backend/tests/payloads/`, regenerated with `TRELLIS_WRITE_PAYLOADS=1` and reviewed as a diff.
- **Frontend**: `frontend/src/**/*.test.ts(x)` (Vitest and React Testing Library) covers the stream client, the session model and layout, the tree, timeline and pane, and the shell. `npm run check:api` fails when the generated API types differ from the backend's OpenAPI schema.
- **Both implementations compared**: before the Node server was removed, its `/api/sessions` output was compared with the Python server's on this developer's local Claude Code sessions. No field differed, `completeness` excluded. That machine had no Codex, Copilot or OpenTelemetry sessions, so those sources were not compared on real data.
- **Claude Code**: parser written against the current on-disk format (subagent transcripts plus `meta.json`), tested on synthetic fixtures in that format, and compared on real sessions as above.
- **Codex and Copilot**: written from their documented formats and tested on synthetic fixtures only; not yet checked against real sessions. Unknown records are skipped rather than guessed at. The newer Copilot `.jsonl` log format is best-effort.
- **Not supported**: OTLP protobuf; very old Claude Code transcripts that kept subagents inline in the main file (those subagents are not drawn).

Run everything with `sh scripts/verify_repository.sh`.

## Layout

```
backend/trellis/       Python package: FastAPI app, session sources, runtime, CLI
  api/                 HTTP routes, guards, intake limits, static file serving
  cli/                 Typer commands, source discovery, server startup, hook settings
  hosts/               Claude Code, Codex and Copilot session readers
  otlp/                OTLP traces and logs
  runtime/             store, event hub, polling and scanning
  sessions/            normalized session models and serialization
backend/tests/         pytest suites grouped by responsibility with payload snapshots and scenarios
frontend/src/          React and TypeScript page (built by Vite into frontend/dist)
```
