<!-- Purpose: explains the browser-to-WASM engine boundary in beginner-friendly terms. Connects: Rust exports to the TypeScript client. -->
# Phase 2 explained: WASM and reference checks

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

## Part B: vectorbt reference checks

### What was built
`reference/scripts/compare_vectorbt.py` runs SMA(10)/SMA(30) crossovers, RSI(14) crossing below 30 and above 70, and close above/below SMA(20) with a 10% stop. It runs all three over the full frozen history of RELIANCE.NS, TCS.NS and SBIN.NS. It computes indicator and signal arrays using the formulas in `/spec`, passes one-bar-shifted signals to vectorbt, and builds the equivalent Strategy AST for the real WASM engine. A small Node bridge reads engine output arrays from the generated module. The check compares trade dates and whole-share counts exactly, and trade fill prices and daily equity at `1e-6` relative tolerance.

### Exact vectorbt settings
Initial capital is Rs 100,000. `size=1.0` with `size_type=percent` means 100% of available cash; `size_granularity=1.0` enforces whole shares; `allow_partial=True` permits the largest affordable whole-share order. `direction=longonly`, `accumulate=False`, `cash_sharing=False`, `upon_long_conflict=Ignore`, next-open execution through `price=open` and one-bar-shifted signals, zero `fees`, `fixed_fees`, and `slippage`, and no forced end-of-data close are used. The stop comparison uses `sl_stop=0.10`, a `FillPrice` stop entry reference and `StopMarket` stop exit. Rust uses the same capital, signals, zero costs/slippage, position size and open-position rule.

### Results and difference
Vectorbt 1.2.1 imports under Python 3.13.6 (pandas 3.1.1). Eight of nine comparisons pass. All three SMA crossover and all three RSI comparisons pass; the close-above-SMA stop strategy passes for RELIANCE.NS and TCS.NS. SBIN.NS differs on 2020-03-02, bar 2502 (zero-based): the 812-share trade entered 2020-02-19 at Rs 292.12591227233435. A signal exit was scheduled from the 2020-02-28 close. On 2020-03-02, open was Rs 281.8838663839738, high Rs 282.7902453755621, low Rs 257.45694149647136 and close Rs 260.4933166503906; the stop was Rs 262.91332104510093. Rust processed the already-scheduled signal exit at the open. vectorbt's built-in stop handling gave priority to the intrabar stop. The exit prices were Rs 281.8838663839738 (Rust) and Rs 262.91332104510093 (vectorbt); close equity was Rs 228917.01286380854 (Rust) and Rs 213512.9300486438 (vectorbt). The relative mismatch is about 6.73%, so it is not within tolerance. Accepted rule G15 defines this same-bar precedence: the scheduled signal exit fills at the open before intrabar stop checks. The engine behavior stayed unchanged. A short attempt to disable stops with per-bar `sl_stop=NaN` values on scheduled-exit bars did not work; vectorbt still stopped the trade. This remains the named `scheduled_signal_exit_vs_intrabar_stop` exception in [decision 028](../decisions/028-vectorbt-stop-order-precedence.md). The SBIN stop comparison is checked only through bar 2501; the exception begins at bar 2502.

### Run it

```powershell
pnpm build:wasm
reference\.venv\Scripts\python.exe reference\scripts\compare_vectorbt.py --symbols RELIANCE.NS,TCS.NS,SBIN.NS
reference\.venv\Scripts\python.exe -m pytest reference\tests -q
```
