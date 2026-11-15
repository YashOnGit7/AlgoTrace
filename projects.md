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
cargo build --manifest-path engine\Cargo.toml --target wasm32-unknown-unknown
pnpm --filter @algotrace/web test
pnpm --filter @algotrace/web typecheck
pnpm --filter @algotrace/web build
```

## Phase checklist (as of 2026-11-15)
- Prompt 0: done (2026-11-14)
- Prompt 1: done (2026-11-15)
- Prompt 2: in progress (2026-11-15; Part A WASM API and wrapper done)
- Prompt 3: not started
- Prompt 4: not started
- Prompt 5: not started
- Prompt 6: not started
- Prompt 7: not started
- Prompt 8: not started
- Prompt 9: not started
- Prompt 10: not started

## Current state
The Rust engine now parses and validates AGT1 data, evaluates strategies, simulates trades, computes metrics, and runs sweeps. Its wasm-bindgen API builds for `wasm32-unknown-unknown`; the TypeScript wrapper has 3 passing tests and strict type checking. The wrapper copies prices into WASM once, then Rust reads them in place. Full worker/UI integration, generated JS bindings, the compiler, and frozen market data are still pending.

## Next step
Generate and load the wasm-bindgen JavaScript package, then connect the wrapper to a Web Worker.

## Known issues and limitations
- Python dependencies were installed and checked on Windows Python 3.13.6; the project brief also supports Python 3.11+.
- Rust is installed under `C:\Users\BIT\.cargo\bin`, but the current PowerShell PATH does not include that folder; use the full executable path or refresh PATH.
- No frozen NSE price files are present; the Rust WASM API and wrapper are built, while generated JS bindings, worker hookup, and full browser integration remain pending.
- `decision 016` is ACCEPTED and contains G1–G14. Decisions 017–019 capture Prompt 1 clarifications.
- `wasm-pack` is not installed in the current environment; only the direct `wasm32-unknown-unknown` Rust build and wrapper interface were verified.
- WASM library Clippy passes; wasm32 `--all-targets` also tries to compile proptest's non-wasm `wait-timeout` test dependency and is not a supported check here.
- The latest engine/spec audit found no remaining differences in the implemented engine behavior. G8 duplicate-node merging, Kahn node ordering, and canonical pretty JSON generation are compiler output responsibilities; the compiler is still a scaffold.
- Strict JSON files cannot contain comment headers; valid JSON files retain valid JSON syntax.
- No ESLint dependency or configuration is present; the fixed dependency list does not include ESLint although the brief requires ESLint-clean code.

## Environment variable names needed
- `GROQ_API_KEY`
- `GROQ_MODEL`

