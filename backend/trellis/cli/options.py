from dataclasses import dataclass, field

from ..util.javascript import JS_WHITESPACE

DEFAULT_PORT = 4318
DEFAULT_HOST = "127.0.0.1"
DEFAULT_SINCE = "24h"
DEFAULT_SOURCES = ("claude", "codex", "copilot")
ASCII_DIGITS = "0123456789"
UNIT_MILLISECONDS = {"m": 60e3, "h": 3600e3, "d": 86400e3, "": 3600e3}


@dataclass
class ServeOptions:
    port: int = DEFAULT_PORT
    host: str = DEFAULT_HOST
    since: str = DEFAULT_SINCE
    claude_dirs: list[str] = field(default_factory=list)
    codex_dirs: list[str] = field(default_factory=list)
    vscode_dirs: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=lambda: list(DEFAULT_SOURCES))
    open_browser: bool = False


def ascii_digit_run(text: str, start: int) -> int:
    end = start
    while end < len(text) and text[end] in ASCII_DIGITS:
        end += 1
    return end


def since_ms(text: str) -> float:
    end = ascii_digit_run(text, 0)
    if end > 0 and text[end : end + 1] == ".":
        fraction_end = ascii_digit_run(text, end + 1)
        if fraction_end > end + 1:
            end = fraction_end
    unit = text[end:].lstrip(JS_WHITESPACE)
    if end == 0 or unit not in UNIT_MILLISECONDS:
        raise ValueError(
            f'--since expects something like 90m, 24h or 7d (got "{text}")'
        )
    return float(text[:end]) * UNIT_MILLISECONDS[unit]
