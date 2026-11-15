<!-- Purpose: documents the FastAPI service. Connects: browser requests to frozen data and the AI provider. -->
# API

FastAPI serves frozen price files and proxies AI requests; the backtest itself runs in the browser.

```mermaid
flowchart LR
  Browser[Browser] --> API[FastAPI]
  API --> Files[Frozen price files]
  API --> Groq[Groq API using environment variables]
```

