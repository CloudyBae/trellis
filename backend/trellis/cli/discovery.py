import os
import sys
from collections.abc import Mapping
from pathlib import Path

VSCODE_FLAVORS = ("Code", "Code - Insiders", "VSCodium", "Cursor")


def default_claude_dirs() -> list[str]:
    return [os.path.join(Path.home(), ".claude", "projects")]


def default_codex_dirs() -> list[str]:
    codex_home = os.environ.get("CODEX_HOME") or os.path.join(Path.home(), ".codex")
    return [os.path.join(codex_home, "sessions")]


def detected_vscode_dirs(
    platform: str = sys.platform, environ: Mapping[str, str] = os.environ
) -> list[str]:
    home = str(Path.home())
    if platform == "darwin":
        base = os.path.join(home, "Library", "Application Support")
    elif platform == "win32":
        base = environ.get("APPDATA") or os.path.join(home, "AppData", "Roaming")
    else:
        base = environ.get("XDG_CONFIG_HOME") or os.path.join(home, ".config")
    candidates = [os.path.join(base, flavor, "User") for flavor in VSCODE_FLAVORS]
    return [candidate for candidate in candidates if os.path.exists(candidate)]
