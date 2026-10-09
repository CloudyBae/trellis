default: dev

install:
    cd backend && uv sync
    cd frontend && npm ci

build: install
    cd frontend && npm run build

dev *args: build
    uv run --project backend --directory backend python -m trellis --open {{args}}
