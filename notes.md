## 2026-11-22 — Prompt 6 browser drag synchronization

### Trace finding and fix
- Inspected the failed Playwright `error-context.md`, `trace.zip`, and captured browser frame. It showed the crossover with an extra SMA still unconnected; AT-E006 was visible on that SMA, but no AT-E005 refusal message appeared.
- The trace showed Auto layout followed by only a 150 ms wait before pointer coordinates were measured. React Flow's `fitView` animation lasts 250 ms, so the target handle moved during the drag. This was a test timing problem; the app's refusal feedback remained intact.
- Updated the browser test to poll node rectangles until they remain stable before each drag. The refused-wire assertion is unchanged in intent and now checks AT-E005 plus the beginner-friendly wrong-type message. No app code changed.
- The old 31-second run was dominated by the 30-second expect timeout waiting for `connection-error`. The test timeout was not increased. The corrected canvas browser test passed in 6.4 seconds within the full run.

### Final command results
- `pnpm test`: compiler 23/23; web 6/6; 29 total passed.
- `pnpm typecheck`: compiler and web TypeScript checks passed.
- `pnpm test:wasm`: 4 real-WASM integration tests passed.
- `pnpm --filter @algotrace/web test:e2e`: 2 browser tests passed (15.7 seconds total).

## 2026-11-15 — Prompt 6 strategy canvas

### What was done
- Made the compiler-backed React Flow strategy builder the default page and retained the worker-backed Prompt 5 backtest demo in a separate tab.
- Added grouped palette entries and parameter editors for every operation in `/spec/nodes.md`, with the specified port colors and live compiler diagnostics.
- Added compiler-owned `canvas-rules` connection checks; the browser flow demonstrates that an incompatible BoolSeries-to-SMA wire is refused with AT-E005.
- Added the three checked-in strategy templates, a deliberately broken example for every AT-E001–AT-E010 error code, and an AT-W001 warning example.
- Added Zustand graph editing with undo/redo, selection delete/duplicate, JSON save/load, and dagre layout. The canvas graph and saved file remain in the AI graph format without React Flow positions.
- Added decisions [039](decisions/039-dagre-canvas-layout.md) and [040](decisions/040-compiler-owned-canvas-type-rules.md), and [phase 6 explanation](docs/phase-6-explained.md). Updated glossary and viva questions.

### Findings and fixes
- The browser test confirmed that visual feedback must not set React state for every wire-drag pointer move; the type check remains immediate, while rejection text is displayed after a short delay.
- Broken fixtures with dangling references need to retain their original edges in Zustand even though React Flow cannot render those edges. A separate `unrenderedEdges` collection preserves the input for compilation and diagnostics.
- The palette-to-crossover flow was exercised with actual mouse connections in Chromium, followed by checks for all ten errors and the warning.

### Commands and outcome
- `pnpm test` — compiler, compiler canvas rules, wrapper, and Zustand tests passed.
- `pnpm typecheck` — compiler and web checks passed.
- `pnpm --filter @algotrace/web build` — Vite production build passed.
- `pnpm --filter @algotrace/web test:e2e` — local Playwright covers the prior backtest browser flow plus the canvas workflow; see final run output.

### Decisions made
- [039](decisions/039-dagre-canvas-layout.md): use user-approved `@dagrejs/dagre`; use a spaced grid before the graph has any connections.
- [040](decisions/040-compiler-owned-canvas-type-rules.md): expose and reuse the compiler's actual type validation for live connection compatibility.

### Open questions
- None for this phase.

### TODO for the next session
- Continue with Prompt 7 when requested.

## 2026-11-15 — Prompt 5 browser thin slice

### What was done
- Built the React page for the spec SMA(10)/SMA(30) graph on the full frozen RELIANCE.NS history. It compiles through `@algotrace/compiler`, reads `VITE_API_URL` (default `http://127.0.0.1:8000`), and fetches AGT1 bytes from FastAPI.
- Added a typed page/worker protocol. The API `ArrayBuffer` transfers to a dedicated worker, which writes prices once into WASM memory, runs the engine twice on initial load, and transfers result arrays back to Lightweight Charts.
- Added the Indian charges checkbox, Indian rupee formatting, final equity/return/closed-trade/charge metrics, startup and second-run timing, and total time including fetch. API unavailable, missing symbol, worker and compiler errors have visible messages.
- Added a Playwright test with `webServer` processes for API and Vite. Real Chromium verifies the reference result, 79 reference records vs 78 closed trades, chart rendering, the Zerodha rerun, and CORS plus the exposed bar-count header from both configured origins.
- Added reference result JSON, decisions 035–038, phase 5 explanation, glossary and viva entries. Playwright remains local-only; revisit CI after the Python/data setup is available there.

### Findings and fixes
- Vectorbt stores 79 trade records, including the still-open final position. Spec metrics correctly report 78 closed trades. The UI displays both explicitly; the Playwright check compares final equity against the saved reference at `1e-6` relative tolerance and asserts both counts.
- First browser-test attempt timed out because the Vite `webServer` command passed a literal `--`; changed it to `pnpm exec vite --host 0.0.0.0`.
- The chart renders multiple canvases, so the browser assertion now checks that a chart canvas is visible instead of assuming exactly one canvas.
- Playwright Chromium installation required network access and succeeded after the user approved the browser download. Local API/browser acceptance required loopback access.

### Commands
- `pnpm test` — passed; compiler 20 tests and web wrapper 3 tests.
- `pnpm typecheck` — passed for compiler and web.
- `pnpm test:wasm` — passed; real 20-bar WASM test and 3 compiler-to-WASM tests.
- `pnpm --filter @algotrace/web test:e2e` — passed after the server command and chart assertion fixes (1 test passed; real browser and API flow).

### TODO
- Revisit running Playwright in CI when Python environment and frozen data can be provisioned there.

## 2026-11-15 — Prompt 3 TypeScript compiler

### What was done
- Read the project brief and all nine specification files before implementing the approved compiler work.
- Built the standalone `@algotrace/compiler` package with one public function, `compile(graph, config)`, and separate files for input validation, normalization, Kahn ordering/cycle detection, type checking, parameter validation, reachability, duplicate merging, constant folding, and AST lowering.
- The compiler consumes only `/spec/ai-graph-format.md` nodes (`id`, `type`, `params`) and edges (`from`, `to`, `port`). Risk-free rate is emitted as annual decimal fraction `0.06`, matching `/spec/ast.md` and Rust `default_risk_free_rate()` in `engine/src/types.rs`.
- Cost presets import `engine/config/cost_presets.json` directly. Only approved defaults are applied; all other required values are validated.
- Added three reference strategy graphs and golden ASTs, invalid examples AT-E001–AT-E010, and an AT-W001 graph under `spec/examples/`.
- Added compiler Vitest suites for errors, goldens, deterministic JSON, fast-check generated graphs vs an independent validity checker, duplicate merging, and config validation.
- Added a real-WASM web integration test: compiles all three example graphs and checks trade counts on RELIANCE.NS and TCS.NS under vectorbt's zero-cost/zero-slippage settings. The existing CI TypeScript job already runs `pnpm test:wasm`.
- Added decision records [029](decisions/029-compiler-input-contract.md) through [034](decisions/034-compiler-fuzz-and-folding.md), compiler pass/example READMEs, phase 3 explanation, glossary entries, and viva questions.

### Files touched
- `compiler/package.json`, `compiler/tsconfig.json`, `compiler/src/`, `compiler/tests/`, `compiler/README.md`, `compiler/src/passes/README.md`.
- `spec/examples/`, `web/package.json`, `web/src/engine/compilerWasm.integration.test.mjs`.
- `decisions/029-compiler-input-contract.md` through `decisions/034-compiler-fuzz-and-folding.md`.
- `docs/phase-3-explained.md`, `docs/glossary.md`, `docs/viva-questions.md`, `projects.md`, `notes.md`.

### Decisions made
- [029](decisions/029-compiler-input-contract.md): AI graph format is the compiler boundary; no React Flow types.
- [030](decisions/030-compiler-defaults-and-cost-source.md): apply only approved defaults, use risk-free annual decimal 0.06, import the engine cost JSON.
- [031](decisions/031-compiler-diagnostic-precedence.md): stop at earliest failing stage and sort its diagnostics deterministically.
- [032](decisions/032-compiler-example-corpus.md): checked-in strategy, error, warning, and golden fixtures.
- [033](decisions/033-compiler-wasm-acceptance.md): run the examples through real WASM with the six specified reference trade counts.
- [034](decisions/034-compiler-fuzz-and-folding.md): use fast-check; keep the v1 constant-fold pass a documented no-op under current operations.

### Problems hit and fixes
- pnpm initially could not reconcile this checkout's generated pnpm v10 module metadata with its pnpm v11 store, and the first install hit a Windows symlink permission error. After rebuilding generated metadata and using the accessible v11 store, the already-approved fast-check install succeeded and updated the lockfile.
- The first AT-E005 fixture accidentally omitted an input, so AT-E006 correctly took precedence. Replaced it with a connected Series-to-BoolSeries mismatch; the error suite then passed.
- Golden ASTs initially represented the optional brokerage cap as `null`; changed normalization to preserve the bundled file's omission of that optional field, matching the source preset exactly.

### Things learned or gotchas
- Rust stores `risk_free_rate` as `0.06`, a decimal fraction per year; this is not 6 percentage points.
- In v1, math/comparison with two `Number` inputs is an error, and other operations require series. Thus a constant-fold stage exists but has no valid expressions to simplify.
- The existing CI TypeScript job already builds WASM and runs `pnpm test:wasm`; adding the second integration file to that script makes CI execute it without workflow changes.

### Commands that worked
- `pnpm test` — exit 0; compiler 20 tests passed and web wrapper 3 tests passed.
- `pnpm typecheck` — exit 0; compiler and web TypeScript checks passed.
- `pnpm test:wasm` — exit 0; wasm-pack built the web package, real 20-bar WASM check passed, and 3 compiler-to-WASM cases passed (covering all 6 expected stock/strategy counts).

### Open questions for me
- None for this compiler phase.

### TODO for the next session
- Wait for the next requested phase. The canvas adapter remains separate from the compiler input contract.
## 2026-11-15 — G15 order precedence and vectorbt exception

### What changed
- Added G15 to `spec/trading-rules.md`: scheduled entries and signal exits fill at the open before stop/take-profit checks; a scheduled signal exit wins over a same-bar stop, including when the open gaps through the stop.
- Kept engine implementation unchanged and added two hand-calculated Rust regression cases in `engine/tests/scheduled_exit_precedence.rs`. They verify the normal open-then-intrabar-stop overlap (9 shares sold at Rs 94.05, final equity Rs 937.45) and a gap below the stop with an already-scheduled exit (9 shares sold at Rs 79.20, final equity Rs 803.80).
- Kept decision 028's measured explanation and marked it ACCEPTED. The vectorbt per-bar stop-array attempt (`NaN` on scheduled-exit bars) did not suppress its stop fill, so no custom callback or workaround was added.
- The reference runner names the exception `scheduled_signal_exit_vs_intrabar_stop`: SBIN.NS stop-strategy parity is checked through bar 2501 only; the overlap starts at bar 2502, 2020-03-02. Eight other full-history pairs remain checked at exact dates/share counts and `1e-6` prices/equity tolerance.
- Updated the phase 2 explanation, glossary, viva questions, reference README, and project state.

### Commands and outcome
- `cargo fmt --manifest-path engine\Cargo.toml -- --check` — exit 0; no output.
- `cargo clippy --manifest-path engine\Cargo.toml --all-targets --all-features -- -D warnings` — exit 0; finished dev profile with no warnings.
- `cargo test --manifest-path engine\Cargo.toml` — exit 0; all 37 tests passed (0 failed), doc tests 0.
- `reference\.venv\Scripts\python.exe reference\scripts\compare_vectorbt.py --symbols RELIANCE.NS,TCS.NS,SBIN.NS` — exit 0; eight full-history PASS results, SBIN stop PASS through bar 2501 and one named exception at bar 2502.
<!-- Purpose: keeps a newest-first verified work log for future sessions. Connects: completed changes and open work to projects.md. -->
# Session notes

## 2026-11-15 — Part B vectorbt reference checks

### What was done
- Added a Python comparison runner and Node bridge that runs the Rust/WASM engine and vectorbt on the same frozen AGT1 history and matching AST/spec signals.
- Ran SMA(10)/SMA(30) crossovers, RSI(14) crossing below 30 and above 70, and close above/below SMA(20) with a 10% stop for RELIANCE.NS, TCS.NS and SBIN.NS (4,160 bars each).
- Vectorbt settings: `init_cash=100000`, `size=1.0`, `size_type=percent`, `size_granularity=1.0`, `allow_partial=True`, `cash_sharing=False`, `direction=longonly`, `accumulate=False`, `upon_long_conflict=Ignore`, `price=open` with entry/exit signals shifted one bar, zero fees/fixed fees/slippage, and no forced end close. The stop run uses `sl_stop=0.10`, `FillPrice` and `StopMarket`.
- Eight of nine comparisons matched. SBIN.NS stop strategy diverged at bar 2502, 2020-03-02: the 812-share trade entered 2020-02-19 at Rs 292.12591227233435. A signal exit from 2020-02-28 was due at the 2020-03-02 open. That bar was O/H/L/C = 281.8838663839738 / 282.7902453755621 / 257.45694149647136 / 260.4933166503906; the 10% stop was Rs 262.91332104510093. Rust exited at the open for a signal; vectorbt exited at the stop. Close equity was Rs 228917.01286380854 (Rust) and Rs 213512.9300486438 (vectorbt). Relative error was about 6.73%, against the unchanged `1e-6` tolerance.
- `/spec/trading-rules.md` does not explicitly state priority when a signal exit is due at the open and the same bar later touches a stop. Recorded the measured difference and unresolved precedence gap in [decision 028](decisions/028-vectorbt-stop-order-precedence.md); engine and spec were not changed.
- Updated `/reference/README.md`, `/docs/phase-2-explained.md`, and `projects.md`. The existing plain HTML page continues to load the real WASM engine and show the 20-bar example output.
- Confirmed vectorbt imports successfully on Python 3.13.6; installed versions are pandas 3.1.1 and vectorbt 1.2.1.

### Files touched
- `reference/scripts/compare_vectorbt.py`, `reference/scripts/run_engine_wasm.mjs`, `reference/scripts/__init__.py`, `reference/tests/test_spec_signals.py`.
- `reference/README.md`, `decisions/028-vectorbt-stop-order-precedence.md`, `docs/phase-2-explained.md`, `docs/glossary.md`, `docs/viva-questions.md`, `projects.md`, `notes.md`.

### Commands that worked
- `reference\.venv\Scripts\python.exe -m pytest reference\tests -q` — exit 0; 4 passed.
- `reference\.venv\Scripts\python.exe reference\scripts\compare_vectorbt.py --symbols RELIANCE.NS,TCS.NS,SBIN.NS` — eight `PASS`; one `DIFF` at SBIN.NS 2020-03-02. Exit 1 is expected because the strict mismatch is preserved and documented.
- `pnpm test:wasm` — exit 0; the actual WebAssembly module passed the 20-bar real-WASM integration test (1 test).
- Python/Node syntax checks and `git diff --check` — exit 0.

### Open questions for me
- Should the simulator prioritize a previously scheduled signal exit at the next open before considering an intrabar stop on that same bar, or should a stop that is later hit during that bar take priority?

### TODO for the next session
- Wait for user review of decision 028 before making any engine or spec change.

## 2026-11-15 — Resolve pnpm version conflict and add real-WASM CI coverage

### What was done
- Changed root `package.json` to `pnpm@11.25.0`, the pnpm version used for this lockfile, and removed explicit version inputs from all pnpm/action-setup steps.
- Expanded the TypeScript CI job to install Rust with the `wasm32-unknown-unknown` target, install wasm-pack 0.15.1, and run `pnpm test:wasm`.
- Replaced the Windows-only WASM build command with a small cross-platform Node launcher; no engine or application source was changed.
- Added [decision 027](decisions/027-pnpm-version-and-wasm-ci.md) and documented the chosen version source and CI coverage in `projects.md`.

### Files touched
- `package.json`, `.github/workflows/ci.yml`, `scripts/build-wasm.mjs`, `decisions/027-pnpm-version-and-wasm-ci.md`, `projects.md`, `notes.md`.

### Commands that worked
- CI workflow review — one pnpm version source, with Rust/WASM setup and `pnpm test:wasm` in the TypeScript job.
- `pnpm --version` — `11.25.0`; root metadata reports `pnpm@11.25.0`.
- `pnpm test` — exit 0; 3 wrapper tests passed and the compiler had no test files.
- `pnpm typecheck` — exit 0 for compiler and web.
- `pnpm --filter @algotrace/web build` — exit 0; Vite built the production bundle.
- `pnpm test:wasm` — exit 0; wasm-pack built the browser package and Vitest passed the real-WASM integration test (1 file, 1 test).
- `git diff --check` — exit 0.

### Open questions for me
- None.

### TODO for the next session
- Commit the listed CI and package-manager changes, push, then confirm the Rust, TypeScript and Python checks are green in the GitHub Actions run for that commit.

## 2026-11-15 — Apply relative-tolerance junk holiday cleanup

### What was done
- Scanned every date in all 15 stock files with the rule that high-low and open-close differences are each at most `1e-9` times the larger absolute price in that pair, and all stock bars present that date have zero volume.
- The only additional qualifying date in the frozen files was 2014-10-15. No other date qualified. Removed it from all 15 stock files; each went from 4,161 to 4,160 bars. The `^NSEI` index file remains at 4,142 bars.
- Added the all-stock cleanup to the downloader before it writes AGT1 files. If any symbol download fails, it writes no files because a partial set cannot satisfy the shared-date check. Added a fake AGT1 file test with a tiny OHLC difference and an idempotence assertion.
- Added [decision 026](decisions/026-zero-volume-flat-bar-cleanup.md) and updated `/data/README.md`, the phase 4 explanation and `projects.md` with the 1e-9 rule, 45 total removed stock rows over the three matching dates, current counts and the adjusted-price limitation.
- Recorded that auto-adjusted prices incorporate splits, bonus issues and dividends; historical prices may not match actual transaction prices, and whole shares and rupee charges use adjusted values. This belongs in the final known-limitations document.

### Files touched
- `api/app/price_data.py`, `api/scripts/download_nse.py`, `api/tests/test_price_data.py`, `data/*.agt1`.
- `data/README.md`, `decisions/026-zero-volume-flat-bar-cleanup.md`, `decisions/025-align-index-stock-series.md`, `docs/phase-4-explained.md`, `projects.md`, `notes.md`.

### Commands that worked
- Full frozen-file scan before removal — identified only 2014-10-15; no other qualifying dates.
- `api\.venv\Scripts\python.exe -m pytest api\tests -q` — exit 0; 14 passed in 0.53s.

### Open questions for me
- None for this cleanup. Keep the adjusted-price issue in the final known-limitations list.

### TODO for the next session
- Include adjusted OHLC and whole-share/charge interpretation in the final known-limitations document.

## 2026-11-15 — Review index-only date gaps and clean confirmed holiday bars

### What was done
- Compared the 21 dates present in each stock file but missing from `^NSEI`; checked weekdays, OHLCV for RELIANCE, TCS and SBIN, and the special-session evidence.
- Removed two unambiguous category-(b) dates, 2014-04-24 and 2026-01-15, from all 15 stock files (30 stock rows total). Every stock changed from 4,163 to 4,161 bars. The index file was not changed and remains at 4,142 bars.
- Kept the two verified non-flat, nonzero-volume weekend Muhurat sessions (2019-10-27 and 2020-11-14). Kept 2014-10-15 because TCS's zero-volume OHLC values disagree with RELIANCE and SBIN by one ULP; this remains unresolved and is not classified or removed.
- Updated `/data/README.md` with cleanup counts, exact symbol format (`^NSEI`; uppercase `.NS` stock tickers), and index/stock alignment guidance. Updated `/api/README.md` with the same API symbol spelling and filename mapping.
- Added [decision 025](decisions/025-align-index-stock-series.md): index/stock comparisons join on timestamp and forward-fill the last index close when missing; never compare by bar position. The engine's same-stock buy-and-hold benchmark is unaffected.
- Updated the phase 4 explanation and current project state with the new bar and weekday-gap counts.

### Files touched
- `data/*.agt1` (two dates removed from each stock file); `data/README.md`; `api/README.md`.
- `decisions/025-align-index-stock-series.md`; `docs/phase-4-explained.md`; `projects.md`; `notes.md`.

### Classification outcome
- (a) Retained: 2019-10-27 and 2020-11-14, verified NSE Muhurat sessions with nonzero volume and non-flat bars.
- (b) Removed: 2014-04-24 and 2026-01-15, all three audited stocks have zero volume and identical OHLC.
- (c) Ordinary active weekday bars: 2011-05-31, 2011-07-14, 2011-11-24, 2012-08-28, 2014-02-17, 2015-04-15, 2016-08-12, and 2018-01-01.
- Unclear pending a definition/evidence for “low” versus “full” volume: 2011-12-26, 2012-01-02, 2012-05-21, 2013-01-01, 2014-01-01, 2014-10-15, 2015-01-01, 2016-01-01, and 2019-01-01. These remain in the data. On 2014-10-15, TCS close is `1021.39453125` and open/high/low are `1021.3945312499999`; RELIANCE and SBIN have exactly flat OHLC.
- The remaining weekday candidates are not filled with synthetic rows. Post-clean weekday-gap reports: 259 for `^NSEI` and 242 per stock.

### Commands that worked
- `api\.venv\Scripts\python.exe -m pytest api\tests -q` — exit 0; 13 passed in 0.67s.
- Binary audit — all 16 files decode, timestamps remain unique and increasing, and both removed dates are absent from all 15 stock files.

### Open questions for me
- Should the nine listed ambiguous dates be assigned category (a) or (c)? Daily OHLCV alone does not distinguish a short session from lower-than-usual volume on an ordinary session; 2014-10-15 also has the one-ULP cross-stock mismatch.

### TODO for the next session
- If needed, resolve ambiguous dates against a defined volume threshold or authoritative historical exchange session records.

## 2026-11-15 — Pin and verify the local API server

### What was done
- Followed the user's approval to add Uvicorn and pinned `uvicorn==0.54.0` in `api/requirements.txt`.
- Updated the Backend tech-stack entry in `docs/PROJECT_BRIEF.md` and `projects.md`; described Uvicorn as local-only.
- Added decision [024](decisions/024-uvicorn-local-server.md), explaining why FastAPI needs a server process and that Uvicorn is only for local use.
- Installed Uvicorn 0.54.0, started FastAPI at `127.0.0.1:8000`, and opened `http://127.0.0.1:8000/api/symbols` in the browser. It returned all 16 frozen symbols with HTTP 200.
- Marked Prompt 4 done after the browser smoke check; the prior section's pending approval was resolved by this user confirmation.

### Files touched
- `api/requirements.txt`, `api/README.md`, `decisions/024-uvicorn-local-server.md`.
- `docs/PROJECT_BRIEF.md`, `docs/phase-4-explained.md`, `projects.md`, `notes.md`.

### Decisions made
- [024](decisions/024-uvicorn-local-server.md): pin Uvicorn 0.54.0 as the local-only ASGI server used to run FastAPI.

### Problems hit and how they were fixed
- The API server could not bind from the restricted shell. Starting the explicitly approved local server with the required permission allowed the browser smoke check to complete.

### Things learned or gotchas
- FastAPI defines request handling; Uvicorn provides the local HTTP listener. `X-Bar-Count` remains exposed through the API's CORS configuration.

### Commands that worked
- `api\.venv\Scripts\python.exe -m pip install -r api\requirements.txt` — installed Uvicorn 0.54.0.
- `api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000` — started the local server; browser request to `/api/symbols` returned HTTP 200 and 16 symbols.
- `api\.venv\Scripts\python.exe -m pytest api\tests -q` — `13 passed in 0.61s` after adding Uvicorn.
- `api\.venv\Scripts\python.exe -m uvicorn --version` — `Running uvicorn 0.54.0 with CPython 3.13.6 on Windows`.
- `git diff --check` — exit 0.

### Open questions for me
- None.

### TODO for the next session
- Connect the web frontend to the verified symbol and price endpoints.

## 2026-11-15 — Prompt 4 frozen NSE data and binary API

### What was done
- Read `docs/PROJECT_BRIEF.md`, all `/spec` files, `projects.md`, `notes.md`, and the existing data/API decisions before making implementation changes.
- Added `api/scripts/download_nse.py`, a one-time yfinance downloader for `^NSEI` and the 15 requested `.NS` stocks. It uses `auto_adjust=True`, checks invalid OHLCV rows and duplicate dates, reports absent weekdays, and writes little-endian AGT1 binary files.
- Downloaded 16 files on 2026-11-15. Each covers 2010-01-04 through 2026-11-13; the index has 4,142 bars and each stock has 4,163 bars. Every file decoded successfully. Quality checks found zero invalid rows and zero duplicate dates; weekday gap candidates were 259 for the index and 240 per stock.
- Added FastAPI routes for `/health`, `/api/symbols`, and `/api/prices/{symbol}?from=&to=`. Price data is read from disk per request; responses include `application/octet-stream` and an exposed `X-Bar-Count` header. CORS is limited to `localhost:5173` and `127.0.0.1:5173`.
- Added round-trip, data-quality, and endpoint/config tests. All 13 API tests pass.
- Recorded data provenance and limitations in `/data/README.md`, added decisions [022](decisions/022-frozen-data-format-and-quality.md) and [023](decisions/023-local-binary-data-api.md), and wrote `/docs/phase-4-explained.md`. Updated the API README, glossary, viva questions, and project state.

### Files touched
- `api/app/main.py`, `api/app/price_data.py`, `api/scripts/download_nse.py`, `api/requirements.txt`, `api/pyproject.toml`, `api/README.md`.
- `api/tests/test_price_data.py`, `api/tests/test_data_api.py`.
- `data/*.agt1`, `data/README.md`, `decisions/022-frozen-data-format-and-quality.md`, `decisions/023-local-binary-data-api.md`.
- `docs/phase-4-explained.md`, `docs/glossary.md`, `docs/viva-questions.md`, `projects.md`, `notes.md`.

### Decisions made
- [022](decisions/022-frozen-data-format-and-quality.md): adjust OHLC consistently; freeze one UTC-midnight timestamped AGT1 file per ticker; report candidate weekday gaps without inventing rows; drop invalid rows and resolve duplicate dates by keeping the last valid bar.
- [023](decisions/023-local-binary-data-api.md): use FastAPI for health, symbol discovery, and binary price delivery; date bounds are inclusive; CORS allows only the local Vite origins; no cache/database layer.

### Problems hit and how they were fixed
- The restricted shell initially could not reach the Python package index. The explicitly requested yfinance package and its dependencies installed after network permission was granted.
- An initial handmade ASGI request helper hung, so endpoint tests were simplified to call the FastAPI route functions and separately verify registered paths, query aliases, and CORS configuration. This avoids adding an unrequested HTTP test dependency.
- Weekday gaps cannot be separated into exchange holidays and source omissions without an NSE holiday calendar. The downloader reports them as candidates and does not fabricate prices.
- Uvicorn is not installed in the existing environment. Approval to add it to `api/requirements.txt` is pending because the project brief requires approval before adding dependencies outside the fixed list. The browser server command is documented but cannot run until that answer is received.

### Things learned or gotchas
- `auto_adjust=True` adjusts the OHLC columns consistently; dates are normalized to 00:00 UTC so API date filters include the expected market day.
- The data has survivorship bias because the requested equities are today's large companies rather than a point-in-time historical universe.
- `X-Bar-Count` must be listed in CORS `expose_headers` for frontend JavaScript to read it.

### Commands that worked
- `api\.venv\Scripts\python.exe -m pip install -r api\requirements.txt` — installed yfinance 1.8.0, pandas 3.1.1, and dependencies.
- `api\.venv\Scripts\python.exe api\scripts\download_nse.py` — downloaded all 16 symbols; zero invalid rows, zero duplicate dates.
- `api\.venv\Scripts\python.exe -m pytest api\tests -q` — `13 passed in 0.65s`.
- `api\.venv\Scripts\python.exe -m py_compile api\app\main.py api\app\price_data.py api\scripts\download_nse.py` — exit 0.
- `git diff --check` — exit 0.

### Open questions for me
- May Uvicorn, the ASGI server required to run FastAPI locally, be added to `api/requirements.txt`? This is the only remaining setup step for opening `/api/symbols` in a browser.

### TODO for the next session
- If approved, add Uvicorn, install requirements, launch the documented local API, verify `/api/symbols`, rerun pytest, and mark Prompt 4 done.

## 2026-11-15 — Prompt 2 Part A generated WASM, test page, and integration test

### What was done
- Confirmed the executable at `C:\Users\BIT\.cargo\bin\wasm-pack.exe`; `wasm-pack --version` returned `wasm-pack 0.15.1`.
- Added `pnpm build:wasm` to build with `--target web` into `web/src/engine/pkg`; added `pnpm test:wasm` to build before running the real-module test. The build script uses the installed wasm-pack and matching local wasm-bindgen CLI, plus Cargo's bin folder on PATH.
- Disabled optional `wasm-opt` in the wasm-pack release profile because it otherwise tries to download Binaryen. This makes the package build work with the local toolchain and no network fetch.
- Added the generated output directory to `.gitignore` and recorded the location and source-control policy in decision [021](decisions/021-wasm-generated-package.md).
- Added a plain HTML smoke page at `web/src/engine/wasm-test.html`, served at `http://127.0.0.1:5173/src/engine/wasm-test.html` when the web dev server runs on localhost port 5173. It uses the same native CSV fixture and displays final equity, closed trade count, and total charges.
- Added a Node/Vitest integration test that imports the generated module and checks final equity Rs 1,250, one closed trade, and zero total charges. The existing 3 wrapper tests use fake exports and fake growing memory; they do not use the real WASM binary.
- Updated the phase explanation, wrapper README, and project state.

### Files touched
- `.gitignore`, `package.json`, `web/package.json`.
- `decisions/021-wasm-generated-package.md`, `web/src/engine/realWasm.integration.test.mjs`, `web/src/engine/wasm-test.html`, `web/src/engine/wasm-test.ts`, `web/src/engine/workedExample.ts`, `web/src/engine/README.md`.
- `docs/phase-2-explained.md`, `projects.md`, `notes.md`.

### Decisions made
- [021](decisions/021-wasm-generated-package.md): generated web bindings go under `web/src/engine/pkg`, are ignored by Git, and are recreated by `pnpm build:wasm` before the dedicated real-WASM test.

### Problems hit and fixes
- The first `pnpm build:wasm` call could not find Cargo because `C:\Users\BIT\.cargo\bin` is not on PATH. The script now prepends that location before invoking the full wasm-pack executable path.
- The first build could not find Cargo on PATH. A later wasm-pack attempt could not fetch its matching `wasm-bindgen` CLI from GitHub/crates.io; its Cargo fallback then succeeded after network access became available. The matching executable is now cached under the local wasm-pack directory, and the build script adds that cache to PATH.
- The next build tried to download optional Binaryen `wasm-opt`; adding `wasm-opt = false` to the wasm-pack release profile removed that unnecessary download. `pnpm test:wasm` now builds the generated package and passes the real-module test.

### Things learned or gotchas
- The 3 regular wrapper tests are deliberately stand-ins; `pnpm test:wasm` is the separate test that loads the actual generated `.wasm` file.
- The HTML page is served by Vite from the repository's web package; build the WASM package first so its generated JavaScript and binary exist under the ignored `pkg` folder.
- The expected worked-example values come from `engine/tests/engine_example.rs`: final equity 1250, one trade, total charges zero with the empty zero-cost preset.

### Commands that worked
- `C:\Users\BIT\.cargo\bin\wasm-pack.exe --version` — `wasm-pack 0.15.1`.
- `pnpm test` — exit 0; compiler has no tests yet; web has 3 passed mock-wrapper tests.
- `pnpm test:wasm` — exit 0; wasm-pack built `web/src/engine/pkg`, and the real-WASM Node test passed (1 test).
- `pnpm typecheck` — exit 0 for compiler and web; `pnpm --filter @algotrace/web build` — exit 0.
- `cargo test --manifest-path engine\Cargo.toml` — exit 0; 35 integration tests passed, with zero failures.
- `cargo fmt --manifest-path engine\Cargo.toml -- --check` and native all-target Clippy with warnings denied — exit 0.
- `git diff --check` — exit 0.

### Open questions for me
- None about the API or expected demo values. This session's browser and shell denied loopback connections, so it could not visually verify the Vite page.

### TODO for the next session
- Open the Vite page locally and confirm it displays Rs 1,250.00, one closed trade, and Rs 0.00 charges; then connect the wrapper to a Web Worker.

## 2026-11-15 — Prompt 2 Part A WASM API

### What was done
- Added `engine/src/wasm_api.rs` with price reserve/free, AST backtest execution, equity pointer/length, columnar trade pointer/length, metrics JSON, result release, and JSON sweep exports.
- Changed the Rust library output to support both native `rlib` and WebAssembly `cdylib`; exported the module only for `wasm32`.
- Added `web/src/engine/wasmClient.ts`, tests, and a data-flow README. Price bytes are copied into WASM one time and then read in place; result views are recreated from the latest memory buffer after potentially growing calls.
- Added a 21-column trade ABI with documented numeric exit reason codes and NaN sentinels for absent exit data.
- Updated engine/web docs, glossary, viva questions, phase 2 explanation, decision 020, and current project state.

### Files touched
- `engine/Cargo.toml`, `engine/src/lib.rs`, `engine/src/wasm_api.rs`, `engine/src/sweep.rs`.
- `web/src/engine/wasmClient.ts`, `web/src/engine/wasmClient.test.ts`, `web/src/engine/README.md`, `web/README.md`.
- `decisions/020-wasm-memory-api.md`, `docs/glossary.md`, `docs/viva-questions.md`, `docs/phase-2-explained.md`, `engine/README.md`, `projects.md`, `notes.md`.

### Decisions made
- [020](decisions/020-wasm-memory-api.md): reserve one input byte allocation; return numeric output as pointer/length columns; return smaller metric/sweep summaries as JSON; rebuild JavaScript views after memory-growing calls.

### Problems hit and fixes
- The initial Rust format check caught one formatting difference; `cargo fmt` applied the canonical format before the final checks.
- `wasm-pack` is not installed. The `wasm32-unknown-unknown` target is installed, so direct Cargo check and build succeeded; generated JS bindings and browser execution remain unverified.
- Cross-target Clippy with `--all-targets` attempts to compile proptest's `wait-timeout` dev dependency, which is not supported for wasm32 in this setup. Native all-target Clippy and wasm32 library-only Clippy both pass.

### Things learned or gotchas
- WASM linear-memory growth can replace the JavaScript buffer. Never keep typed-array views across a call that can allocate/grow; ask the wrapper for fresh views after a run.
- “Zero-copy” here means Rust reads the price bytes in place after one browser-to-WASM copy. The initial transfer is still a copy.
- Trade result arrays are stored column by column in this order: entry bar, exit bar, shares, entry price, exit price, exit reason code, seven entry charge columns, seven exit charge columns, and net profit.

### Commands that worked
- `C:\Users\BIT\.cargo\bin\cargo.exe fmt --manifest-path engine\Cargo.toml -- --check` — exit 0, no output.
- `C:\Users\BIT\.cargo\bin\cargo.exe check --offline --manifest-path engine\Cargo.toml --target wasm32-unknown-unknown` — exit 0.
- `C:\Users\BIT\.cargo\bin\cargo.exe build --offline --manifest-path engine\Cargo.toml --target wasm32-unknown-unknown` — exit 0.
- `C:\Users\BIT\.cargo\bin\cargo.exe clippy --offline --manifest-path engine\Cargo.toml --all-targets --all-features -- -D warnings` — exit 0.
- `C:\Users\BIT\.cargo\bin\cargo.exe clippy --offline --manifest-path engine\Cargo.toml --target wasm32-unknown-unknown --lib -- -D warnings` — exit 0.
- `C:\Users\BIT\.cargo\bin\cargo.exe test --offline --manifest-path engine\Cargo.toml` — exit 0; all 35 integration tests passed.
- `pnpm --filter @algotrace/web test` — exit 0; 3 wrapper tests passed.
- `pnpm --filter @algotrace/web typecheck` and `pnpm --filter @algotrace/web build` — exit 0.

### Open questions for me
- None for the pointer/data layout. The generated JS glue path will depend on the wasm-pack or wasm-bindgen packaging step.

### TODO for the next session
- Generate the wasm-bindgen JS package and connect `WasmEngineClient` to the browser worker.

## 2026-11-15 — Prompt 1 pure-Rust engine

### Follow-up audit and accepted rules G8–G14
- Decision 016 remains ACCEPTED and now contains G1–G14. The matching rules are recorded in `spec/ast.md`, `spec/metrics.md`, `spec/trading-rules.md`, `spec/data-format.md`, `spec/costs.md`, and `spec/nodes.md`.
- Corrected the metric specification to use `trading_days_per_year`, and added a 126-day, nonzero-risk-free-rate formula test.
- Updated the engine for configured-risk-free Sortino, longest peak recovery duration, market-style stop slippage, limit-style target fills, timestamp/price/volume validation, one-time percentage conversion into per-run rates, supplied preset validation, and serde key order.
- The repeat audit found no remaining behavior differences in implemented engine areas. G8 merge and Kahn ordering plus pretty canonical JSON are compiler output responsibilities; the compiler remains a scaffold.
- Direct coverage: indicators (`indicators.rs`); binary parsing and no-look-ahead (`data_evaluator.rs`); evaluator operations (`evaluator_ops.rs`, `data_evaluator.rs`); trading (`engine_example.rs`, `final_bar.rs`, `stops.rs`, `properties.rs`); costs (`costs.rs`); metrics (`metrics.rs`); AST key ordering (`serialization.rs`); sweeps (`sweep.rs`).
- Formatting, warning-denied Clippy, and test checks passed. The suite now has 35 integration tests.

### What was done
- Implemented the native Rust engine modules for shared types, borrowed AGT1 data, indicators, AST evaluation, charges, simulation, metrics, and parameter sweeps.
- Added hand-calculated fixtures, no-look-ahead and end-of-data checks, cost and stop tests, and proptest portfolio invariants.
- Added the accepted G1–G14 rules and clarified preset semantics across the matching `/spec` files.
- Added the non-negative-cash shortfall rule; a run errors before a sell that would produce negative cash.
- Restored `spec/data-format.md` from the supplied specification after finding its text incorrectly appended to `spec/metrics.md` as a literal patch marker.
- Updated the engine README, glossary, phase 1 explanation, project status, and this log.

### Files touched
- `engine/Cargo.toml`, `engine/Cargo.lock`, `engine/README.md`, `engine/src/lib.rs`, `engine/src/types.rs`, `engine/src/data.rs`, `engine/src/indicators.rs`, `engine/src/evaluator.rs`, `engine/src/costs.rs`, `engine/src/simulator.rs`, `engine/src/metrics.rs`, `engine/src/sweep.rs`.
- `engine/tests/README.md`, `engine/tests/common/mod.rs`, `engine/tests/costs.rs`, `engine/tests/data_evaluator.rs`, `engine/tests/engine_example.rs`, `engine/tests/evaluator_ops.rs`, `engine/tests/final_bar.rs`, `engine/tests/indicators.rs`, `engine/tests/metrics.rs`, `engine/tests/properties.rs`, `engine/tests/serialization.rs`, `engine/tests/stops.rs`, `engine/tests/sweep.rs`.
- `engine/tests/fixtures/README.md`, `engine/tests/fixtures/indicator_values.csv`, `engine/tests/fixtures/crossover_20.csv`.
- `spec/ast.md`, `spec/costs.md`, `spec/data-format.md`, `spec/metrics.md`, `spec/nodes.md`, `spec/trading-rules.md`.
- `decisions/016-spec-gap-resolutions.md`, `engine/src/types.rs`.
- `decisions/017-engine-semantics.md`, `decisions/018-sweep-workspace.md`, `decisions/019-reject-negative-cash.md`.
- `docs/glossary.md`, `docs/phase-1-explained.md`, `projects.md`, `notes.md`.

### Decisions made
- [017](decisions/017-engine-semantics.md): original Prompt 1 clarifications, now superseded where G10–G14 provide updated normative semantics.
- [018](decisions/018-sweep-workspace.md): prepare the graph once and reuse evaluation, trade, and equity buffers; return one metric summary per sweep value.
- [019](decisions/019-reject-negative-cash.md): reject a run before any sell that would make cash negative.
- [016](decisions/016-spec-gap-resolutions.md) is ACCEPTED and contains G1–G14.

### Problems hit and fixes
- `cargo` was installed under `C:\Users\BIT\.cargo\bin` but was not on the active shell PATH. Calling its full path enabled the requested checks; no toolchain installation was needed.
- The first dependency fetch could not resolve crates.io in the restricted network. The approved retry downloaded only dependencies already listed in `engine/Cargo.toml`.
- The first compile found slice/vector output type mismatches and unused warnings. Output helpers now borrow reusable vectors, shared test helpers allow dead code only in their test module, and Clippy's copy/loop warnings were fixed.
- A metrics test expected exact zero despite ordinary floating-point residue; its assertion now uses the specified `1e-6` tolerance.
- The original specification text for the binary layout was missing as a separate file. It was restored from the supplied prompt, and the stray marker was removed from `metrics.md`.

### Things learned or gotchas
- `PriceView` borrows the original byte slice and reads one little-endian number at a time, avoiding six copied arrays and alignment assumptions.
- Sweep iterations reuse per-node series plus simulator equity/trade vector capacity. Metrics are accumulated without building a new daily-return vector.
- A fixed sell DP fee can exceed tiny sale proceeds after a severe price fall; `/spec/trading-rules.md` now requires rejecting the run in that case to keep cash non-negative.
- The native crate is `rlib` only in this phase. `wasm-bindgen` remains target-specific for the later WASM phase; no WASM exports or build were added.
- Remaining compiler-side spec questions: duplicate-node merge identity and top-level/config AST JSON key ordering.

### Commands that worked
- `C:\Users\BIT\.cargo\bin\cargo.exe fmt --manifest-path engine\Cargo.toml -- --check` — exit 0, no output.
- `C:\Users\BIT\.cargo\bin\cargo.exe test --offline --manifest-path engine\Cargo.toml` — exit 0; 35 integration tests passed, zero failed; unit and doc-test targets had zero tests.
- `C:\Users\BIT\.cargo\bin\cargo.exe clippy --offline --manifest-path engine\Cargo.toml --all-targets --all-features -- -D warnings` — exit 0; finished with no warnings.

### Open questions for me
- Duplicate-node merge identity and top-level/config AST JSON key order are still open for the compiler phase.
- ESLint remains unconfigured because the fixed dependency list does not include it, while the brief requires an ESLint-clean state.

### TODO for the next session
- Define Prompt 2 compiler scope and resolve its remaining AST serialization/duplicate-node questions before compiler implementation.

## 2026-11-14 — Initial repository and specification setup

### What was done
- Saved the supplied Master Prompt as `docs/PROJECT_BRIEF.md`.
- Created the approved monorepo scaffold and nine specification files.
- Recorded the 15 requested initial decisions and draft decision 016.
- Added starter setup files and CI workflow.
- Created ignored local Python virtual environments, installed both requirements files, and ran both Python smoke tests.
- Installed the pnpm workspace, generated its lockfile, and passed JS tests, strict type checks, and the web production build.

### Files touched
- Root: `.gitignore`, `.env.example`, `README.md`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `projects.md`, `notes.md`.
- `docs/`: `PROJECT_BRIEF.md`, `README.md`, `architecture.md`, `glossary.md`, `viva-questions.md`, `phase-0-explained.md`.
- `spec/`: `README.md`, `nodes.md`, `types.md`, `trading-rules.md`, `costs.md`, `metrics.md`, `data-format.md`, `ast.md`, `errors.md`, `ai-graph-format.md`.
- `decisions/`: `README.md`, `TEMPLATE.md`, `001-rust-engine.md` through `016-spec-gap-resolutions.md`.
- `engine/`: `README.md`, `Cargo.toml`, `src/lib.rs`, `config/README.md`, `config/cost_presets.json`.
- `compiler/`: `README.md`, `package.json`, `tsconfig.json`, `src/index.ts`.
- `web/`: `README.md`, `package.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `src/main.tsx`.
- `api/`: `README.md`, `requirements.txt`, `pyproject.toml`, `app/__init__.py`, `app/main.py`, `tests/test_project_setup.py`.
- `reference/`: `README.md`, `requirements.txt`, `pyproject.toml`, `tests/test_project_setup.py`.
- `data/README.md`, `bench/README.md`, `eval/README.md`, `.github/workflows/ci.yml`, `docs/phase-0-explained.md`.

### Decisions made
- See [001](decisions/001-rust-engine.md) through [015](decisions/015-local-demo.md).
- [016](decisions/016-spec-gap-resolutions.md) records G1–G7 and is now ACCEPTED.
- Gaps resolved and placed in matching specs: G1 parameter ranges; G2 deterministic AST; G3 undefined metrics; G4 end-of-data handling; G5 rounding and tolerances; G6 warm-up/invalid values; G7 final-bar signals.

### Problems hit and fixes
- The first request's spec placeholder was initially missing. The user supplied the specification in a later attachment; it is now captured in `/spec`.
- The workspace had no Git repository metadata or pre-existing files. The requested files were created from the approved plan.
- The first pnpm install hit the Windows sandbox's symlink restriction; after the user-approved elevated install and a narrow pnpm build-script allowlist, `pnpm install --frozen-lockfile` passed.
- Python venv bootstrap initially hit a restricted system temp directory. `ensurepip` succeeded after using a temporary directory inside the workspace.
- Python package downloads first failed in the restricted network; the approved installs then succeeded.

### Things learned or gotchas
- Verified local tools: Node v24.21.0, pnpm v11.25.0, Python v3.13.6. Rust/Cargo are unavailable on PATH; pytest is not installed globally.
- `Cargo.lock` is not present because no local Cargo toolchain is available to generate it.
- JSON does not allow comments, so JSON manifests/configuration omit the otherwise required header comment to remain valid JSON.
- `docs/PROJECT_BRIEF.md` is byte-identical to the source and therefore has no prepended header comment; adding one would violate the user's word-for-word requirement.
- Gaps G1–G7 are recorded in `spec/nodes.md`, `spec/ast.md`, `spec/metrics.md`, `spec/trading-rules.md`, `spec/costs.md`, and `spec/types.md`.
- `pnpm-workspace.yaml` allows only the `esbuild` install script and explicitly denies `es5-ext`; the frontend tools install and build with this policy.
- `pnpm install` reported deprecated transitive dependencies from Plotly.js (`@plotly/mapbox-gl`, `mumath`); the required fixed charting library was retained.
- Residual specification questions: **GUESS:** G2's “duplicate nodes merge” means identical computations with distinct ids, since duplicate ids still trigger `AT-E001`; the equivalence rule is unspecified. G2 also does not define top-level/config JSON key ordering. Sortino's downside threshold, drawdown-length convention, how slippage applies to stop/take fills, and treatment of invalid input price bars are not specified. **GUESS:** the JSON preset uses percentage-point numbers (for example, `0.1` to represent 0.1%) based on the `_pct` field names; the storage-unit convention should be confirmed before engine calculations are implemented.
- ESLint is named as a quality requirement but is absent from the fixed dependency list, so no ESLint package/config was added without approval.

### Commands that worked
- `pnpm install` (after build-script policy was configured)
- `pnpm install --frozen-lockfile` — exit 0, “Already up to date”, pnpm 11.25.0.
- `pnpm test` — exit 0; Vitest reported “No test files found” for compiler and web, expected for this scaffold.
- `pnpm typecheck` — exit 0; `tsc --noEmit` passed for compiler and web.
- `pnpm --filter @algotrace/web build` — exit 0; Vite transformed 25 modules and built the production bundle.
- `api\.venv\Scripts\python.exe -m pytest api\tests` — 1 passed in 1.64s.
- `reference\.venv\Scripts\python.exe -m pytest reference\tests` — 1 passed in 40.51s.
- Hash comparison verified `docs/PROJECT_BRIEF.md` is byte-identical to the pasted attachment; cost JSON parsed successfully; all 9 spec files, 16 records, and both local venv interpreters were found.

### Open questions for me
- Decision 016 remains marked DRAFT as requested. See the residual specification questions above before engine behavior is frozen.
- Rust `cargo test`, `cargo fmt`, and `cargo clippy` remain unverified because `cargo` is not installed or on PATH.

### TODO for the next session
- Review the residual specification questions and draft decision 016, install Rust, then run `cargo test`, `cargo fmt -- --check`, and `cargo clippy --all-targets --all-features -- -D warnings`.


## 2026-11-25 — Strategy language
- Implemented the no-dependency lexer, precedence-climbing parser, and graph lowering under `compiler/src/language/`; the public API is `compileSource(source, config)`.
- Added `/spec/strategy-language.md`, paired `.strategy` versions of the three reference programs, invalid fixtures AT-S001–AT-S006, frontend documentation, and decision records 041–044.
- Approved details: assignments/rules/settings can be interleaved after an optional first-line title; assignments must precede use; comments can trail statements while `#` inside a title is preserved; CRLF/LF and missing final newline are equivalent; positions are 1-based with end-exclusive spans and tabs count as one column. Unterminated title text is AT-S002. Uppercase keyword/function hints direct the user to lowercase spelling.
- Every generated node has a source span, and graph compiler errors map to source locations. Unary minus lowers to `SUB(CONSTANT(0), operand)`.
- Verified `pnpm test` (45 tests), `pnpm typecheck`, and `pnpm test:wasm` (4 tests). The WASM integration compiles all three language examples and confirms reference trade counts on RELIANCE.NS and TCS.NS.
