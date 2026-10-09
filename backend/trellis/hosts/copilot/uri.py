import os
import posixpath
import re
from urllib.parse import unquote, urlsplit

from ...util.javascript import js_string, js_trim
from ..files import read_json
from .fields import field, first_text


def linkless(text: object) -> str:
    string_value = "" if text is None else js_string(text)
    return js_trim(re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", string_value))


def workspace_name(storage_dir: str) -> str:
    ws = read_json(os.path.join(storage_dir, "workspace.json"))
    uri = first_text(field(ws, "folder"), field(ws, "workspace"))
    try:
        parts = urlsplit(uri.strip())
        path = unquote(parts.path.replace("\\", "/"), errors="strict")
    except ValueError:
        return ""
    if not parts.scheme or not path:
        return ""
    return posixpath.normpath(path).rsplit("/", 1)[-1]
