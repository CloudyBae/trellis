# Trellis

Watch your AI agents work, live.

Trellis reads what Claude Code, Codex and GitHub Copilot already save on your computer and draws each run as a tree: who started what, and what is running, waiting, blocked or done.

Everything stays on your machine.

## Install

1. Install [uv](https://docs.astral.sh/uv/getting-started/installation/) (one time).
2. Run this:

```sh
uv tool install https://github.com/CloudyBae/trellis/releases/download/v0.1.0/trellis-0.1.0-py3-none-any.whl
```

Newer version? Swap `0.1.0` (twice) for the one on the [releases page](https://github.com/CloudyBae/trellis/releases) and add `--force`.

## Use

```sh
trellis --open
```

Your browser opens at http://127.0.0.1:4318. Runs from the last 24 hours show up on their own.

No runs yet? Click **Watch a demo run**.

## What the states mean

| State | Meaning |
|---|---|
| running | Working right now |
| waiting | Waiting on its helpers, or on you |
| blocked | Asking your permission (needs the hooks below) |
| failed | Something went wrong |
| complete | Done |

## Get "blocked" alerts (recommended)

```sh
trellis hooks
```

Copy what it prints into `~/.claude/settings.json`. Claude Code keeps working if Trellis is closed.

## Options

```sh
trellis --help
```

| Option | Does |
|---|---|
| `--since 7d` | Look further back (`90m`, `24h`, `7d`) |
| `--only claude,codex,copilot` | Read only some tools |
| `--port 4319` | Use a different port |

## Privacy

- Only reachable from this computer.
- Your session files are read, never changed.

## Other computers

Install on each one. Each Trellis shows only that computer's runs.

## Good to know

- The Codex and Copilot readers are only tested on made-up sample data so far.
- Not supported: OpenTelemetry in protobuf format (JSON only), Copilot CLI sessions (VS Code Copilot chats work), and very old Claude Code sessions that stored helpers inside the main file.

## For developers

Needs Python 3.12 or later (3.14 for development), uv, and Node.

```sh
(cd backend && uv sync)
(cd frontend && npm ci && npm run build)
uv run --project backend --directory backend python -m trellis --open
```

Run all checks with `sh scripts/verify_repository.sh`.

Release: push a tag like `v0.1.0` and GitHub builds the wheel and publishes it.

<details>
<summary>Send data from containers, CI or other agents (OpenTelemetry)</summary>

Trellis accepts OTLP over HTTP with JSON at `http://127.0.0.1:4318/v1/traces` and `/v1/logs`.

Claude Code:

```sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
```

Codex (`~/.codex/config.toml`):

```toml
[otel]
exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/logs", protocol = "json" } }
```

To receive from containers, start Trellis with `--host 0.0.0.0`. Nothing is password protected, so only do this on a network you trust.

</details>
