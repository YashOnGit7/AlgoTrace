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
- API: Python 3.11+, FastAPI, pydantic, pytest, Uvicorn 0.54.0 (local server only), httpx 0.28.1, python-dotenv 1.2.4.
- Frozen data: one-time yfinance download; references use pandas and vectorbt.
- AI: Groq chat completions via FastAPI; model ID is configured in ignored `api/.env` with `GROQ_API_KEY` and `GROQ_MODEL` (GPT-OSS 120B is the planned default).
- Package manager: pnpm 11.25.0, selected only by the root `package.json`; GitHub Actions reads that field.

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
pnpm --filter @algotrace/web dev:demo
pnpm test
pnpm typecheck
pnpm --filter @algotrace/web build
pnpm build:wasm
pnpm test:wasm
pnpm --filter @algotrace/web exec playwright install chromium
pnpm --filter @algotrace/web test:e2e
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

## Phase checklist (updated 2026-11-26)
- Prompt 0: done (2026-11-14)
- Prompt 1: done (2026-11-15)
- Prompt 2 Parts A and B: done (2026-11-15; WASM package, visible HTML demo source, and eight full-history vectorbt comparisons plus one named SBIN stop-precedence exception (compared through bar 2501))
- Prompt 3: done (2026-11-15; standalone multi-pass TypeScript compiler, graph fixtures, deterministic ASTs, fuzz tests, and real-WASM acceptance)
- Prompt 4: done (2026-11-15; frozen data, AGT1 validation, FastAPI routes, local Uvicorn server, and tests verified)
- Prompt 5: done (2026-11-15; React page, typed worker protocol, compiler-generated AST, full-history real API/WASM equity curve, startup/second-run timings, charges toggle, and local Chromium acceptance)
- Prompt 6: done (2026-11-15; Playwright drag synchronization corrected 2026-11-22; compiler-backed React Flow canvas with all spec node editors, live type-safe connections, compiler diagnostics, templates, undo/redo, graph files, dagre layout, and local browser acceptance)
- Prompt 7: done (2026-11-25; handwritten strategy language, source maps, examples, and real-WASM reference checks)
- Strategy Studio: done (2026-11-26; code-first front page, read-only graph preview, source feedback, remembered drafts, and real-browser acceptance)
- Prompt 8: done (2026-11-26; Strategy Studio front page, code editor, read-only graph, and browser acceptance)
- Prompt 9: done (2026-11-26; Groq proxy, compiler-checked assistant repairs, five offline examples, and mocked browser flows)
- Prompt 10: not started

## Current state
The complete student-facing project guide is [docs/PROJECT_COMPLETE_GUIDE.md](docs/PROJECT_COMPLETE_GUIDE.md). It consolidates the architecture, language/compiler, engine semantics, costs and metrics, data/API details, test evidence, known limitations, likely viva questions, and an 11-slide speaking outline for `deliverables/AlgoTrace_Project_Presentation.pptx`. It is a study aid and does not replace the normative `/spec` files. The optional Groq diagnostic is `api/scripts/check_groq.py`; it reports safe provider failure details without printing the API key. Provider tests are mocked and live connectivity still requires the local check.

The Rust engine now parses and validates AGT1 data, evaluates strategies, simulates trades, computes metrics, and runs sweeps. Its wasm-bindgen API builds with wasm-pack for the web target, and the generated package is recreated under the Git-ignored `web/src/engine/pkg`. The wrapper has 3 passing mock-based tests; a separate Node integration test loads the generated binary and passes the shared 20-bar example (final equity Rs 1,250, one closed trade, Rs 0 charges). The plain HTML smoke page is ready at `/src/engine/wasm-test.html`. Part B reference scripts compare three strategies over full history on RELIANCE.NS, TCS.NS and SBIN.NS; eight vectorbt runs match exactly on trade dates/share counts and within `1e-6` on prices/equity. The SBIN stop strategy matches through bar 2501; bar 2502 (2020-03-02) is the named `scheduled_signal_exit_vs_intrabar_stop` exception. G15 is accepted and the engine behavior remains unchanged. A per-bar stop-array attempt did not disable vectorbt stop handling, so no workaround was added; see [decision 028](decisions/028-vectorbt-stop-order-precedence.md). `/data` has 16 validated AGT1 files (NIFTY 50 plus 15 requested stocks). The 15 stock files now have 4,160 bars each after removal of three shared zero-volume flat holiday dates; `^NSEI` has 4,142 bars. For index-to-stock comparisons, align on timestamps and forward-fill the index close, never align by bar position. Decision [025](decisions/025-align-index-stock-series.md) records the rule; the engine's same-stock buy-and-hold benchmark is unaffected. Decision [026](decisions/026-zero-volume-flat-bar-cleanup.md) records the repeatable 1e-9 relative-flatness cleanup. The standalone `@algotrace/compiler` exports `compile(graph, config)` for the AI graph format, with ordered validation/optimization passes, error fixtures for AT-E001–AT-E010, golden ASTs, and fast-check fuzz coverage. Root tests pass (39 compiler and 15 web unit tests), and the real-WASM integration checks all six RELIANCE.NS/TCS.NS strategy trade counts against the vectorbt yardsticks. The React app opens on Strategy Studio, with the advanced compiler-backed canvas and quick demo in navigation tabs. The new Assistant sends plain-English requests through FastAPI to Groq, checks source with the existing compiler, performs at most two repair attempts, and never starts a backtest. Five fixed offline examples compile and are clearly labeled as built-in answers; provider requests use low reasoning effort and exclude reasoning. See docs/phase-9-explained.md and decisions 050-052. The Studio compiles source, shows positioned errors, remembers drafts, and runs through the existing API, worker, WASM, and chart. Its generated graph reuses the canvas node cards and dagre layout in read-only mode, with a friendly message when source has errors. Local Playwright checks the first-page navigation and controls, reference equity and 78 closed RELIANCE.NS trades with zero costs, and source-error correction. See docs/phase-8-explained.md and decisions 047-049. The advanced canvas retains its own editor, compiler diagnostics, templates, dagre layout, undo/redo, delete/duplicate, and JSON save/load; Playwright remains local-only.

## Next step
The Strategy Studio code editor and AI assistant are complete. Continue with the next requested project feature. The advanced canvas and quick demo remain available in navigation tabs; the SBIN reference exception remains limited to comparison through bar 2501, as recorded in [decision 028](decisions/028-vectorbt-stop-order-precedence.md).

## Known issues and limitations
- Python dependencies were installed and checked on Windows Python 3.13.6; the project brief also supports Python 3.11+.
- Rust is installed under `C:\Users\BIT\.cargo\bin`, but the current PowerShell PATH does not include that folder; use the full executable path or refresh PATH.
- Frozen data uses yfinance 1.8.0 once for educational use; it is unofficial and today's large-company list has survivorship bias. After removing the three shared zero-volume flat dates, quality checks report 259 weekday gap candidates for `^NSEI` and 243 per stock; these are not filled with invented bars. Stock symbols use uppercase `.NS` names, while the index is `^NSEI`. Index-to-stock comparisons join on timestamp and forward-fill the latest index close; see [025](decisions/025-align-index-stock-series.md). Adjusted OHLC does not represent the historical transaction prices, and whole-share quantities and rupee charges use those adjusted values; list this in the final known-limitations document.
- The API exposes `/health`, `/api/symbols`, and inclusive-date `/api/prices/{symbol}` binary responses, with CORS restricted to the two local Vite origins and no cache layer. Uvicorn 0.54.0 is pinned and used only to run FastAPI locally.
- `decision 016` is ACCEPTED and contains G1–G14. Decisions 017–019 capture Prompt 1 clarifications.
- `wasm-pack 0.15.1` is installed at `C:\Users\BIT\.cargo\bin\wasm-pack.exe`. `pnpm build:wasm` uses the local matching `wasm-bindgen` CLI cache and disables the optional `wasm-opt` download, so it succeeds without fetching those binaries.
- WASM library Clippy passes; wasm32 `--all-targets` also tries to compile proptest's non-wasm `wait-timeout` test dependency and is not a supported check here.
- The compiler uses Kahn ordering, duplicate merging, and canonical AST serialization. Its v1 constant-fold pass is intentionally a no-op because no foldable constant-only operation is permitted by the spec; see [phase 3 explanation](docs/phase-3-explained.md).
- Strict JSON files cannot contain comment headers; valid JSON files retain valid JSON syntax.
- No ESLint dependency or configuration is present; the fixed dependency list does not include ESLint although the brief requires ESLint-clean code.
- CI's TypeScript job now builds and runs the real WASM integration test after installing Rust's wasm target and wasm-pack 0.15.1; see [decision 027](decisions/027-pnpm-version-and-wasm-ci.md).
- The reference comparison has eight complete matches and one named exception: SBIN.NS stop strategy, `scheduled_signal_exit_vs_intrabar_stop`, beginning at bar 2502 (2020-03-02). The run checks that strategy only through bar 2501. Accepted G15 specifies the engine priority; decision [028](decisions/028-vectorbt-stop-order-precedence.md) records vectorbt's different stop handling and the unsuccessful per-bar stop-array attempt. Engine behavior is unchanged.

## Environment variable names needed
- `GROQ_API_KEY`
- `GROQ_MODEL`


- The web app reads `VITE_API_URL` with default `http://127.0.0.1:8000`; FastAPI currently allows only Vite origins `http://127.0.0.1:5173` and `http://localhost:5173`. Playwright checks both origins in Chromium. The page uses zero costs by default and displays 78 closed trades plus 79 total records (one is open).

## Latest verified work — 2026-11-25
The strategy language has three paired `.strategy` reference programs and one invalid source fixture for each AT-S001–AT-S006. Tests cover source locations, comments and title strings, CRLF/LF, missing final newline, statement interleaving, source-map translation, deterministic serialization, and fast-check properties. Real WASM compiles the three source examples and checks the same trade counts as the vectorbt fixtures on RELIANCE.NS and TCS.NS. See [phase 7 explanation](docs/phase-7-explained.md), [language spec](spec/strategy-language.md), and decisions 041–044.
