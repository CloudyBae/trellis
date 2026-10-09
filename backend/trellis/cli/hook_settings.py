import json

HOOK_EVENTS = (
    "SessionStart",
    "UserPromptSubmit",
    "Notification",
    "Stop",
    "SubagentStop",
    "SessionEnd",
)
TOOL_HOOK_EVENTS = ("PreToolUse", "PostToolUse")


def hooks_snippet(port: int) -> str:
    command = (
        "curl -s -m 2 -X POST -H 'Content-Type: application/json' --data-binary @- "
        f"http://127.0.0.1:{port}/hooks/claude >/dev/null 2>&1 || true"
    )

    def entry(matcher: str | None = None) -> list[dict[str, object]]:
        hook = {"type": "command", "command": command, "timeout": 5}
        return [{"matcher": matcher, "hooks": [hook]} if matcher else {"hooks": [hook]}]

    hooks = {name: entry() for name in HOOK_EVENTS}
    hooks.update({name: entry("*") for name in TOOL_HOOK_EVENTS})
    return json.dumps({"hooks": hooks}, indent=2)
