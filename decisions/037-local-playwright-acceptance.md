<!-- Purpose: records the browser test's reference source and local-only scope. Connects: frozen data and vectorbt output to end-to-end verification. -->
# 037: Local browser acceptance against reference

## Context (plain words)
The page needs a real-browser proof that the API, worker, compiled AST, WASM, and chart work together on frozen RELIANCE.NS history.

## Options considered
- Assert only that the worker returns a result.
- Compare the visible final equity and record counts with a checked-in vectorbt reference and verify the chart renders.

## Decision
Store the measured SMA crossover output in `reference/results/reliance_sma_crossover.json`. The Playwright test runs Chromium with the API and Vite servers launched by `webServer`; it checks the 4,160 bars, 79 total trade records, 78 closed trades, final equity within 1e-6 relative tolerance, a visible equity chart, and a Zerodha-preset rerun with positive charges. It also verifies the exposed bar-count header in a browser at both allowed Vite origins. Keep Playwright out of CI for now because the test needs the local Python environment and frozen data; revisit CI browser execution in a later phase.

## Why (beginner level)
Comparing to the saved independent result checks actual backtest output, while the chart assertion proves the user can see it in the browser.

## Trade-offs
The browser test needs a Playwright Chromium install plus the local API venv and frozen data. It is therefore a documented local command, not part of CI.

## Interview answer (30 seconds)
I start the local API and Vite from Playwright, then check a real Chromium run against the saved vectorbt result. I kept it out of CI for now because it relies on Python setup and the local dataset, and recorded that we should revisit CI later.
