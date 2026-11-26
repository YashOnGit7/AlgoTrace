<!-- Purpose: explains the local API routes and data flow. Connects: browser requests to frozen price files. -->
# API

FastAPI serves frozen price files; strategy backtests continue to run in the browser. Uvicorn 0.54.0 is included only as the local ASGI server for the demo.

```mermaid
flowchart LR
  Browser[Local web app] -->|GET symbols and price bytes| API[FastAPI]
  Browser -->|POST sentence for code| API
  API -->|final code or one question| Groq[Groq chat completions]
  API -->|read per request; no cache layer| Files[AGT1 files in /data]
  Downloader[One-time yfinance script] -->|validate and encode| Files
```

## Routes

- `GET /health` returns `{"status":"ok"}`.
- `GET /api/symbols` lists symbols whose files exist in `/data`.
- `GET /api/prices/{symbol}?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `application/octet-stream` bytes. Either date is optional; both bounds are inclusive. `X-Bar-Count` reports the number of returned daily bars.
- `POST /api/generate` accepts `{ "text": "...", "previous_code": "...", "errors": ["Line 4: ..."] }`. Repair fields are optional. It returns either `{ "code": "..." }` or `{ "question": "..." }`. The local API sends the sentence to Groq, includes the checked-in strategy-language specification in its system prompt, and returns only final message content. It uses a 20-second provider timeout and a 20-request-per-minute per-client limit.

The AI route reads `GROQ_API_KEY` and `GROQ_MODEL` from `api/.env`; create it by copying `api/.env.example`. The key file is ignored by Git. Model and key failures return HTTP 503 with a friendly message. Tests use fake responses and do not contact Groq. The API does not store prompts, keys, or reasoning text.

## Symbol names

Use the exact names returned by `/api/symbols`: the index is `^NSEI`; stock symbols are uppercase ticker names with the `.NS` suffix (for example, `RELIANCE.NS`). Preserve capitalization and punctuation in requests. The index maps to `NIFTY_50.agt1`; stock files omit `.NS` (for example, `RELIANCE.NS` maps to `RELIANCE.agt1`).

CORS allows only `http://localhost:5173` and `http://127.0.0.1:5173`, with GET and POST for the existing data routes and AI proxy. No backtest runs on this API, and no cache or database is used.

Run from the repository root in Windows PowerShell:

```powershell
api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
```

Then open `http://127.0.0.1:8000/api/symbols` in a browser.
