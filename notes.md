<!-- Purpose: keeps a newest-first verified work log for future sessions. Connects: completed changes and open work to projects.md. -->
# Session notes

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
- [016](decisions/016-spec-gap-resolutions.md) records G1–G7 and is marked DRAFT.
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

