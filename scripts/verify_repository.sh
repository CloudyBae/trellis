set -eu

script_directory=`dirname "$0"`
CDPATH= cd "$script_directory/.."

uv sync --project backend

npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npx --prefix frontend playwright install chromium
npm --prefix frontend run check:widths
npm --prefix frontend run check:api

uv run --project backend --directory backend python -m pytest
uv run --project backend --directory backend python -m ruff check .
uv run --project backend --directory backend python -m ruff format --check .
uv run --project backend --directory backend python -m pyright
