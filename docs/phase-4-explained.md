<!-- Purpose: explains the frozen market data and its local API in beginner-friendly terms. Connects: data source, quality checks, and browser. -->
# Phase 4 explained: frozen data and API

## What was built
The one-time yfinance script downloads daily adjusted OHLCV history for the NIFTY 50 index and 15 specified NSE stocks from 2010-01-01 through the latest available date. It checks prices, volume, duplicates, and weekday gaps, then writes one AGT1 binary file per symbol. The API now has health, available-symbol, and date-filtered binary-price routes, with CORS limited to the local Vite web app.

The frozen snapshot was downloaded on 2026-11-15 with Python 3.13.6, yfinance 1.8.0, and pandas 3.1.1. All 16 files cover 2010-01-04 through 2026-11-13. Quality checks found zero invalid rows and zero duplicate dates. Review of 21 dates present in every stock file but absent from `^NSEI` found three shared zero-volume flat dates (2014-04-24, 2014-10-15 and 2026-01-15); those rows were removed from the 15 stock files (4,163 to 4,160 bars each). Flatness uses relative tolerance 1e-9 and is applied automatically by the downloader. The index remains at 4,142 bars. Current weekday gap candidates are 259 for `^NSEI` and 243 for each stock; without a complete historical exchange holiday calendar, these are not filled with invented prices. Adjusted OHLC includes corporate-action adjustments, so whole-share counts and rupee charges use prices that may differ from what investors paid historically; this is a known limitation for the final known-limitations document. Symbol spelling and date alignment rules are documented in `/data/README.md`. Uvicorn 0.54.0 runs the FastAPI process locally and is not a separate production service.

## Why
The browser needs stable daily history in the format the Rust engine already reads. The API supplies those bytes and leaves strategy execution in the browser.

## Everyday analogy
The downloader is like making labeled copies of a textbook once. It checks that pages are readable and reports missing page numbers, but does not write in replacement pages. FastAPI is the library desk: it tells the browser which books exist and hands over the requested pages.

## Explain it in one minute
I used yfinance once to retrieve adjusted daily prices for the requested index and stocks, then stored each symbol in AlgoTrace's AGT1 column-based binary format. The quality checks drop invalid rows, resolve duplicate dates, and report weekday gaps without fabricating prices. FastAPI lists the data and returns binary bytes with an inclusive date filter and bar-count header. CORS is restricted to the two local Vite origins, and there is no cache layer or server-side backtest. The source is unofficial and educational; because it represents today's large companies, the dataset has survivorship bias.

## Run locally

```powershell
api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/api/symbols`.
