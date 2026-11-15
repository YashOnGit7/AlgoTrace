<!-- Purpose: records the minimal HTTP interface for frozen prices. Connects: the local browser to files without server-side backtests or cache infrastructure. -->
# 023: Local binary data API

## Context (plain words)
The browser needs to discover frozen symbols and fetch their AGT1 bytes, optionally for a date range.

## Options considered
- Read local binary files from the browser directly.
- Use FastAPI to list available files and return their bytes.
- Add a database or cache layer for the frozen dataset.

## Decision
Expose `GET /health`, `GET /api/symbols`, and `GET /api/prices/{symbol}?from=&to=`. Price responses use `application/octet-stream` and include an `X-Bar-Count` header, exposed to browser JavaScript. Optional `from` and `to` dates are inclusive. Allow CORS only from `http://localhost:5173` and `http://127.0.0.1:5173`. Read the file for each request; do not add Redis, PostgreSQL, or another cache layer.

## Why (beginner level)
The API stays a small delivery service. It makes the browser's available choices explicit and gives the engine the same binary data format used by the native code.

## Trade-offs
Reading each file per request is simple and avoids stale cached copies, but it repeats disk reads. Only the two local Vite origins can call the API from a browser.

## Interview answer (30 seconds)
FastAPI only lists the frozen files and streams the selected AGT1 bytes. Inclusive date filters let the browser request only the period it needs, and a bar-count header gives it the returned length. CORS is restricted to the local frontend and no cache or database is used.
