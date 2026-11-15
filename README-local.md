<!-- Purpose: explains AlgoTrace and gives Windows setup commands. Connects: all project modules and their setup instructions. -->
# AlgoTrace

AlgoTrace is a browser-based backtesting platform for one Indian equity at a time. Its full project brief is in [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md); specifications in `/spec` are the source of truth.

## Windows setup

Install Git, Node.js, pnpm, Rust, and Python 3.11 or newer. From PowerShell in the repository root:

```powershell
pnpm install
python -m venv api\.venv
api\.venv\Scripts\python -m pip install -r api\requirements.txt
python -m venv reference\.venv
reference\.venv\Scripts\python -m pip install -r reference\requirements.txt
cd engine
cargo test
cargo fmt -- --check
cargo clippy --all-targets --all-features -- -D warnings
cd ..
pnpm test
pnpm typecheck
api\.venv\Scripts\python -m pytest api\tests
reference\.venv\Scripts\python -m pytest reference\tests
```

The Python environments are generated locally and are not committed. Install packages with the two requirements files before running Python checks. No API key is needed for the empty scaffolding; copy `.env.example` to `.env` only when configuring the AI proxy.

## Project map

- `compiler/`: graph validation and Strategy AST package.
- `web/`: React browser application.
- `engine/`: Rust backtesting engine.
- `api/`: FastAPI service.
- `data/`: frozen price-file provenance and eventual datasets.
- `reference/`: independent Python calculations.
- `spec/`: normative formats and behavior.
- `decisions/`: design records.
- `docs/`: learning and architecture notes.
- `bench/`, `eval/`: later benchmark and AI evaluation work.

