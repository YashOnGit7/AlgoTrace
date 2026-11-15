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
- API: Python 3.11+, FastAPI, pydantic, pytest, Uvicorn 0.54.0 (local server only).
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
api\.venv\Scripts\python.exe api\scripts\download_nse.py # run once to recreate the frozen snapshot
python -m venv reference\.venv
reference\.venv\Scripts\python -m pip install -r reference\requirements.txt
pnpm --filter @algotrace/web dev
pnpm test
pnpm typecheck
pnpm --filter @algotrace/web build
pnpm build:wasm
pnpm test:wasm
api\.venv\Scripts\python -m pytest api\tests
api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
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
- Prompt 2 Part A: done (2026-11-15; WASM package, real integration test, and HTML demo source complete)
- Prompt 3: not started
- Prompt 4: done (2026-11-15; frozen data, AGT1 validation, FastAPI routes, local Uvicorn server, and tests verified)
- Prompt 5: not started
- Prompt 6: not started
- Prompt 7: not started
- Prompt 8: not started
- Prompt 9: not started
- Prompt 10: not started

## Current state
The Rust engine now parses and validates AGT1 data, evaluates strategies, simulates trades, computes metrics, and runs sweeps. Its wasm-bindgen API builds with wasm-pack for the web target, and the generated package is recreated under the Git-ignored `web/src/engine/pkg`. The wrapper has 3 passing mock-based tests; a separate Node integration test loads the generated binary and passes the shared 20-bar example (final equity Rs 1,250, one closed trade, Rs 0 charges). The plain HTML smoke page is ready at `/src/engine/wasm-test.html`; local page display could not be checked from this session because its browser and shell block loopback requests. `/data` has 16 validated AGT1 files (NIFTY 50 plus 15 requested stocks). The 15 stock files now have 4,160 bars each after removal of three shared zero-volume flat holiday dates; `^NSEI` has 4,142 bars. For index-to-stock comparisons, align on timestamps and forward-fill the index close, never align by bar position. Decision [025](decisions/025-align-index-stock-series.md) records the rule; the engine's same-stock buy-and-hold benchmark is unaffected. Decision [026](decisions/026-zero-volume-flat-bar-cleanup.md) records the repeatable 1e-9 relative-flatness cleanup. Full worker/UI integration and the compiler are still pending.

## Next step
Connect the frontend to `/api/symbols` and `/api/prices/{symbol}`, then continue the compiler phase.

## Known issues and limitations
- Python dependencies were installed and checked on Windows Python 3.13.6; the project brief also supports Python 3.11+.
- Rust is installed under `C:\Users\BIT\.cargo\bin`, but the current PowerShell PATH does not include that folder; use the full executable path or refresh PATH.
- Frozen data uses yfinance 1.8.0 once for educational use; it is unofficial and today's large-company list has survivorship bias. After removing the three shared zero-volume flat dates, quality checks report 259 weekday gap candidates for `^NSEI` and 243 per stock; these are not filled with invented bars. Stock symbols use uppercase `.NS` names, while the index is `^NSEI`. Index-to-stock comparisons join on timestamp and forward-fill the latest index close; see [025](decisions/025-align-index-stock-series.md). Adjusted OHLC does not represent the historical transaction prices, and whole-share quantities and rupee charges use those adjusted values; list this in the final known-limitations document.
- The API exposes `/health`, `/api/symbols`, and inclusive-date `/api/prices/{symbol}` binary responses, with CORS restricted to the two local Vite origins and no cache layer. Uvicorn 0.54.0 is pinned and used only to run FastAPI locally.
- `decision 016` is ACCEPTED and contains G1–G14. Decisions 017–019 capture Prompt 1 clarifications.
- `wasm-pack 0.15.1` is installed at `C:\Users\BIT\.cargo\bin\wasm-pack.exe`. `pnpm build:wasm` uses the local matching `wasm-bindgen` CLI cache and disables the optional `wasm-opt` download, so it succeeds without fetching those binaries.
- WASM library Clippy passes; wasm32 `--all-targets` also tries to compile proptest's non-wasm `wait-timeout` test dependency and is not a supported check here.
- The latest engine/spec audit found no remaining differences in the implemented engine behavior. G8 duplicate-node merging, Kahn node ordering, and canonical pretty JSON generation are compiler output responsibilities; the compiler is still a scaffold.
- Strict JSON files cannot contain comment headers; valid JSON files retain valid JSON syntax.
- No ESLint dependency or configuration is present; the fixed dependency list does not include ESLint although the brief requires ESLint-clean code.

## Environment variable names needed
- `GROQ_API_KEY`
- `GROQ_MODEL`

