<!-- Purpose: explains the worker-backed browser demo in beginner-friendly terms. Connects: FastAPI prices, the compiler, Rust/WASM, and an equity chart. -->
# Phase 5 explained: browser worker backtest

## What was built
The Vite React page now runs the checked-in SMA(10)/SMA(30) crossover on all 4,160 frozen RELIANCE.NS daily bars. The page fetches AGT1 bytes from FastAPI, compiles the graph with the TypeScript compiler, and transfers the price buffer and AST to a dedicated Web Worker. The worker initializes wasm-pack output, copies the input bytes once into WASM memory, runs the engine twice on page load, and transfers result arrays back. Lightweight Charts displays the equity curve.

The page shows final equity, total return, closed trades, total charges, API price-download time, initial WASM setup/data-upload/warm-up time, the latest engine-only backtest time, and latest end-to-end elapsed time. Rupee values use Indian digit grouping and two decimals. The `Indian charges (Zerodha delivery)` checkbox changes the cost preset and reruns the history.

## What each timing measures
WASM initialization does **not** run in parallel with the price download. The worker is created before the fetch, but it only initializes the WASM module after the page has received the complete price buffer and posted it to the worker.

- **API price download (request + bytes)** starts immediately before `fetch()` and stops after the response body has been read into an `ArrayBuffer`. It is refreshed on each run.
- **Initial WASM setup + data upload + warm-up run (page load)** is measured inside the worker after it receives the initial buffer. It includes loading/initializing the WASM module, reading dates from the input, copying prices into WASM, and the first warm-up backtest. It excludes the network fetch. This value remains the first-load timing when the charges checkbox triggers a later run.
- **Backtest engine time (latest run)** measures only the Rust/WASM `runBacktest` call for the latest run. On the initial page load, this is the second backtest after warm-up; after changing charges, it is the charges run. It excludes module initialization, network, and copying results back to the page.
- **End-to-end elapsed (latest API request to processed result)** starts before the latest `fetch()` and ends after the page receives and processes the worker's result arrays. It includes download, compilation, worker messaging, any initial WASM setup and warm-up, and the displayed backtest. It stops before React paints the updated chart.

The first-load WASM setup timing and the latest end-to-end timing can refer to different runs after the charges toggle. Do not compare them as if they were nested intervals. For engine performance benchmarks, quote **Backtest engine time (latest run)** and identify the symbol, strategy, cost preset, bar count, and whether it is the first or a repeated run. Quote download and end-to-end timings separately for user-visible latency; do not call the combined latency an engine benchmark.

The API base is read from `VITE_API_URL`, defaulting to `http://127.0.0.1:8000`. Playwright's `webServer` starts API and Vite for the real Chromium acceptance test. That test verifies CORS from both configured Vite origins, the full bar count, the chart, and measured output against the vectorbt reference file.

## Why
Backtests belong off the browser's main thread so the page remains responsive. Transferable buffers avoid cloning large arrays between threads. WASM retains the fetched price bytes so a strategy run reads them in place.

## Everyday analogy
The API hands the page a sealed box of price data. The page passes the box to a separate workshop (the worker), which puts the data on the WASM workbench once, runs the strategy, then sends back individually packed result boxes. The page opens those result boxes and draws the equity line.

## Explain it in one minute
On page load, React requests the full RELIANCE.NS price file and compiles the exact SMA crossover graph used by the reference comparison. It transfers the price ArrayBuffer to a worker, which initializes the Rust/WASM module and writes the prices once into its memory. The worker does a first run that includes startup, then a second timed run. It copies equity, dates, trade columns, and metric values into standalone typed arrays and transfers those buffers back. A separate validity mask preserves null metrics without NaN. The page formats its summary in rupees and draws every daily equity point with Lightweight Charts. The Playwright test opens real Chromium, uses the live local API, and compares final equity to the saved vectorbt output at `1e-6` relative tolerance.

The reference comparator reports 79 trade records for this strategy because one position is still open at the end. The specification's closed-trade metric is 78; the page labels the record total separately instead of counting the open position as closed.

## Run the browser test

```powershell
pnpm --filter @algotrace/web exec playwright install chromium
pnpm --filter @algotrace/web test:e2e
```

Playwright acceptance is local-only for now. It uses the installed API Python environment and frozen files; decision [037](../decisions/037-local-playwright-acceptance.md) records a future CI revisit.
