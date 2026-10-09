import json
import sys
import tempfile

from ..api.app import create_app
from .options import DEFAULT_HOST, DEFAULT_PORT, ServeOptions
from .serve import build_runtime


def main() -> None:
    with tempfile.TemporaryDirectory() as empty_directory:
        options = ServeOptions(
            since="7d",
            claude_dirs=[empty_directory],
            codex_dirs=[empty_directory],
            vscode_dirs=[empty_directory],
        )
        runtime = build_runtime(options, clock=lambda: 0.0, log=lambda message: None)
        app = create_app(
            runtime=runtime,
            port=DEFAULT_PORT,
            host=DEFAULT_HOST,
            static_directory=None,
        )
        sys.stdout.write(json.dumps(app.openapi()))


if __name__ == "__main__":
    main()
