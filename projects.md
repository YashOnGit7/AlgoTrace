<!-- Purpose: records verified project state and the next action for a future contributor. Connects: project brief, specs, setup instructions, and phase status. -->
# AlgoTrace project state

## What AlgoTrace is (5 lines)
AlgoTrace is a browser-based backtesting platform for Indian equities (NSE).
Users describe a strategy in plain English or build it on a node canvas.
A TypeScript compiler validates the graph and emits a Strategy AST.
A Rust engine compiled to WebAssembly runs the strategy in a browser worker.
FastAPI serves price files and proxies AI; it does not run the backtest.

## Architecture and tech stack
- Frontend: React 18, strict TypeScript, Vite, @xyflow/react, Lightweight Charts, Plotly.js for heatmaps, Zustand, Vitest, Playwright.
- Compiler: plain TypeScript.
- Engine: Rust 2021, wasm-bindgen, wasm-pack, serde, serde_json, proptest.
- API: Python 3.11+, FastAPI, pydantic, pytest.
- Frozen data: one-time yfinance download; references use pandas and vectorbt.
- AI: Groq Llama 3 family model via FastAPI; `GROQ_API_KEY` and `GROQ_MODEL` are names only.

## Folder map
`spec/` behavior; `decisions/` records; `docs/` learning docs; `engine/` Rust; `compiler/` TypeScript compiler; `web/` React app; `api/` FastAPI; `data/` frozen files; `reference/` Python yardsticks; `bench/` measurements; `eval/` AI evaluation.

## How to run, test, and build (Windows PowerShell)
Run from the repository root unless a `cd` command is shown:

```powershell
pnpm install
python -m venv api\.venv
api\.venv\Scripts\python -m pip install -r api\requirements.txt
python -m venv reference\.venv
reference\.venv\Scripts\python -m pip install -r reference\requirements.txt
pnpm --filter @algotrace/web dev
pnpm test
pnpm typecheck
pnpm --filter @algotrace/web build
api\.venv\Scripts\python -m pytest api\tests
reference\.venv\Scripts\python -m pytest reference\tests
cargo test --manifest-path engine\Cargo.toml
cargo fmt --manifest-path engine\Cargo.toml -- --check
cargo clippy --manifest-path engine\Cargo.toml --all-targets --all-features -- -D warnings
```

## Phase checklist (as of 2026-11-15)
- Prompt 0: done (2026-11-14)
- Prompt 1: done (2026-11-15)
- Prompt 2: not started
- Prompt 3: not started
- Prompt 4: not started
- Prompt 5: not started
- Prompt 6: not started
- Prompt 7: not started
- Prompt 8: not started
- Prompt 9: not started
- Prompt 10: not started

## Current state
The pure-Rust engine now parses AGT1 data through borrowed views, evaluates strategy AST nodes, calculates indicators and charges, simulates trades, calculates metrics, and runs reusable-buffer sweeps. Its 28 integration tests, formatting check, and warning-denied Clippy check pass. WebAssembly/browser integration is intentionally not part of Prompt 1. The compiler and main web features are still scaffolds, and frozen market data is not present.

## Next step
Define the scope and resolve the remaining compiler-specific specification questions before Prompt 2.

## Known issues and limitations
- Python dependencies were installed and checked on Windows Python 3.13.6; the project brief also supports Python 3.11+.
- Rust is installed under `C:\Users\BIT\.cargo\bin`, but the current PowerShell PATH does not include that folder; use the full executable path or refresh PATH.
- No frozen NSE price files or backtest implementation exist.
- `decision 016` is explicitly DRAFT; decisions 017–019 capture the Prompt 1 clarifications.
- Strict JSON files cannot contain comment headers; valid JSON files retain valid JSON syntax.
- No ESLint dependency or configuration is present; the fixed dependency list does not include ESLint although the brief requires ESLint-clean code.
- Compiler-specific details from `notes.md` remain open: duplicate-node merge criteria and top-level/config AST key ordering.

## Environment variable names needed
- `GROQ_API_KEY`
- `GROQ_MODEL`

