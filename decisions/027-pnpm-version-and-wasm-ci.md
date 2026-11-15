<!-- Purpose: chooses a single pnpm version source and verifies real WASM in CI. Connects: reproducible JS installs to the Rust browser build. -->
# 027: Use package.json as the pnpm version source and test real WASM in CI

## Context (plain words)
The workflow named pnpm 11.25.0 while the root package metadata named pnpm 10.0.0. The TypeScript job also checked the wrapper tests without building and running the real Rust WebAssembly module.

## Options considered
- Pin pnpm separately in both the GitHub Action and package.json.
- Put the pnpm version in package.json and let the action read it.
- Keep the real WebAssembly integration test local only.

## Decision
The root `package.json` is the single source for pnpm, set to `pnpm@11.25.0`. Every `pnpm/action-setup` step omits its `version` input. The TypeScript job installs the stable Rust toolchain with the `wasm32-unknown-unknown` target, installs wasm-pack 0.15.1, and runs `pnpm test:wasm`. The root build script uses a cross-platform Node launcher so the same test command works in Windows development and Ubuntu CI.

## Why (beginner level)
Keeping one version avoids conflicting instructions. The CI job now builds the Rust module and runs the integration test against the real generated WebAssembly package, so it checks the module that the browser will load.

## Trade-offs
CI takes longer because it installs Rust and wasm-pack and compiles the WebAssembly engine. In return, a successful TypeScript job also verifies the real browser-targeted engine package.

## Interview answer (30 seconds)
I made package.json the only place that selects pnpm 11.25.0, so GitHub Actions reads the same version as local installs. I also added the wasm target and wasm-pack to the TypeScript job and run the real-WASM integration test there.
