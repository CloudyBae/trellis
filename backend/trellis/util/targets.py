import os
import re

from .javascript import (
    WS_CLASS,
    clip,
    has_content,
    js_string,
    js_text,
    parse_json,
)

PATH_WORD = "[A-Za-z0-9_@.\\-]"
MENTIONED_PATH = re.compile(
    f"(?:\\A|[{WS_CLASS}(\"'`])"
    "((?:~|\\.{1,2})?/" + PATH_WORD + "+(?:/" + PATH_WORD + "+)+/?"
    "|[A-Za-z0-9_\\-]+(?:/" + PATH_WORD + "+)+\\.[A-Za-z0-9_]{1,6})"
    f"(?=[{WS_CLASS})\"'`,:;]|\\.(?:[{WS_CLASS}]|\\Z)|\\Z)"
)
SHELL_NAMES = ("sh", "bash", "zsh")


def tilde(path: str | None) -> str | None:
    if not path:
        return path
    home = os.path.expanduser("~")
    return "~" + path[len(home) :] if path.startswith(home) else path


def _rel(path: str, cwd: str | None) -> str:
    if not path:
        return path
    if cwd and path.startswith(cwd + "/"):
        return path[len(cwd) + 1 :]
    return tilde(path) or ""


def _basename(path: str) -> str:
    return path.rstrip("/").rsplit("/", 1)[-1]


def _js_values(mapping: dict[str, object]) -> list[object]:
    indexes = [
        key
        for key in mapping
        if key.isascii()
        and key.isdigit()
        and str(int(key)) == key
        and int(key) < 2**32 - 1
    ]
    indexes.sort(key=int)
    rest = [key for key in mapping if key not in indexes]
    return [mapping[key] for key in indexes + rest]


def target_of(value: object, cwd: str | None = None) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            parsed = parse_json(value)
        except ValueError:
            return clip(value.split("\n")[0], 140)
        return target_of(parsed, cwd)
    if not isinstance(value, (dict, list)):
        return js_string(value)
    properties: dict[str, object] = value if isinstance(value, dict) else {}
    values = _js_values(value) if isinstance(value, dict) else value
    command = properties.get("command")
    if command is None:
        command = properties.get("cmd")
    if isinstance(command, list):
        if len(command) >= 3 and _basename(js_text(command[0])) in SHELL_NAMES:
            return clip(command[-1], 140)
        return clip(
            " ".join(js_string(item) if item is not None else "" for item in command),
            140,
        )
    if isinstance(command, str):
        return clip(command.split("\n")[0], 140)
    file = None
    for file_key in ("file_path", "filePath", "notebook_path", "path"):
        file = properties.get(file_key)
        if file is not None:
            break
    pattern = properties.get("pattern")
    if isinstance(pattern, str):
        shown = ""
        if has_content(file):
            shown = _rel(file, cwd) if isinstance(file, str) else js_string(file)
            shown = f"  {shown}"
        return clip(pattern + shown, 140)
    if isinstance(file, str):
        return _rel(file, cwd)
    for key in ("url", "query", "skill", "description", "prompt", "message"):
        candidate = properties.get(key)
        if isinstance(candidate, str):
            return clip(candidate.split("\n")[0], 140)
    first = next((item for item in values if isinstance(item, str)), None)
    return clip(first.split("\n")[0], 140) if first else ""


def mentioned_paths(value: object, cwd: str | None = None) -> list[str]:
    found: list[str] = []
    for match in MENTIONED_PATH.finditer(js_text(value)):
        path = match.group(1)
        if path.endswith((".", ",")):
            path = path[:-1]
        if path.startswith(("//", "http:", "https:")):
            continue
        shown = _rel(path, cwd)
        if shown not in found:
            found.append(shown)
        if len(found) >= 6:
            break
    return found
