<!-- Purpose: explains the browser-to-WASM engine boundary in beginner-friendly terms. Connects: Rust exports to the TypeScript client. -->
# Phase 2, Part A explained

## What was built
The Rust engine now exports a small wasm-bindgen API for reserving and freeing AGT1 bytes, running AST JSON, reading equity and columnar trade arrays by pointer and length, retrieving metrics JSON, and running parameter sweeps. A strict TypeScript client writes the input bytes once and creates fresh result views from the current WASM memory buffer. `pnpm build:wasm` generates a web-target package under `web/src/engine/pkg`; generated files are ignored by Git. A plain HTML page runs the shared 20-bar crossover fixture and displays final equity, trade count, and charges.

## Why
The browser needs a predictable way to send a frozen price file into Rust and read results back without turning every column into JSON. The sweep response stays JSON because it is a small collection of metric summaries; the large equity and trade data uses typed arrays.

## Everyday analogy
WASM memory is a shared workbench. The browser places the price file on it once, Rust reads it there and puts each result field in a separate tray, and JavaScript uses a typed label to view each tray. If the workbench expands, JavaScript must make new labels because old ones may point to the old surface.

## Explain it in one minute
The TypeScript wrapper asks Rust for a byte buffer large enough for an AGT1 file and writes the bytes into that allocation once. Rust's borrowed price view reads the same bytes for a backtest or sweep. After a run, Rust stores daily equity and each trade field in separate `f64` columns. JavaScript receives pointers and lengths, then creates fresh `Float64Array` views from the latest `memory.buffer`. This matters because WebAssembly memory growth can replace that buffer. Metrics and sweep summaries are returned as small JSON strings. The phrase zero-copy applies to repeated engine reads from stored input; it does not claim the initial browser-to-WASM write is copy-free.

## Verification
The three regular TypeScript wrapper tests use a fake in-memory WASM stand-in. `pnpm test:wasm` builds the generated web package and runs a separate Node test against the actual `.wasm` binary. It passes with the native 20-bar expected values: final equity Rs 1,250, one closed trade, and Rs 0 total charges. The plain HTML page at `web/src/engine/wasm-test.html` runs the same fixture and displays those three values. The page is served with `pnpm --filter @algotrace/web dev --host 127.0.0.1` and opened at `http://127.0.0.1:5173/src/engine/wasm-test.html`. This session's browser and shell blocked loopback connections, so the page was not visually exercised here; its underlying WASM flow is covered by the passing Node integration test.
