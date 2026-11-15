<!-- Purpose: records where wasm-pack puts generated bindings. Connects: reproducible builds to web imports and Git hygiene. -->
# 021: Generated WASM package location

**Status: ACCEPTED**

## Context (plain words)
The web wrapper needs a stable place to import the JavaScript glue and compiled WebAssembly module produced by wasm-pack. These files are build outputs that can be recreated from the Rust crate.

## Options considered
- Commit generated bindings and the `.wasm` file to the repository.
- Generate them into the web engine source folder and ignore that output in Git.

## Decision
`pnpm build:wasm` runs wasm-pack with the `web` target and writes the generated package to `web/src/engine/pkg`. The directory is ignored by Git. The optional `wasm-opt` step is disabled so the build does not need a separate Binaryen download. The explicit `pnpm test:wasm` command builds this package before running the real-WASM integration test.

## Why (beginner level)
The wrapper can import the package from one predictable location, while every clone can regenerate it with one command instead of storing compiled files in source control.

## Trade-offs
The first test or demo run must build the package, and wasm-pack with a matching wasm-bindgen CLI must be installed. The output is not optimized by Binaryen. A plain `pnpm test` still runs the fast mock-based tests without requiring a WASM build.

## Interview answer (30 seconds)
We generate the wasm-bindgen web package under the wrapper and ignore it because it is reproducible output. One command builds it, and another command builds then tests the real module. This keeps Git focused on source while making the tested artifact reproducible.
