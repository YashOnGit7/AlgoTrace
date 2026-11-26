# AlgoTrace

<!-- Purpose: explains the project and local demo setup. Connects: Strategy Studio, FastAPI, Groq, and the browser backtest. -->

AlgoTrace is a local-first strategy editor and backtesting demo for NSE daily prices. Strategy Studio can turn a plain-English request into language code, check it in the browser compiler, and run only after the user presses **Run backtest**. FastAPI serves frozen data and proxies the optional AI request; the Rust/WASM backtest runs in the browser.

## Run locally on Windows

Install the repository dependencies and create the local API environment as described in `projects.md`. Copy the AI settings example once:

```powershell
Copy-Item api\.env.example api\.env
notepad api\.env
```

Set `GROQ_API_KEY` to a key created at `https://console.groq.com/keys` and `GROQ_MODEL` to a Groq model ID such as `openai/gpt-oss-120b`. Keep `api/.env` private; Git ignores it. If those values are empty or Groq is unreachable, use the labeled Offline demo mode or the Examples dropdown.

Start FastAPI in one PowerShell window from the repository root:

```powershell
api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
```

Start the web app in another PowerShell window:

```powershell
pnpm --filter @algotrace/web dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. To change the key or model, edit `api/.env`, stop the running API with Ctrl+C, and start it again with the command above. The AI assistant writes code only; a person must review it and press Run.

## Checks

```powershell
api\.venv\Scripts\python.exe -m pytest api\tests
pnpm test
pnpm typecheck
pnpm test:wasm
pnpm --filter @algotrace/web test:e2e
```
