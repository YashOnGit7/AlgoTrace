<!-- Purpose: keeps a newest-first verified work log for future sessions. Connects: completed changes and open work to projects.md. -->
# Session notes

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

