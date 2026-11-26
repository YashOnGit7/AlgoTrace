<!-- Purpose: explains the API application modules and AI privacy boundary. Connects: browser requests, Groq, and local frozen data. -->
# FastAPI application

```mermaid
flowchart LR
  Browser[Studio] -->|POST sentence and optional repair context| Route[/api/generate]
  Route --> Limit[Per-client in-memory limit]
  Limit --> Prompt[Load strategy-language spec and examples]
  Prompt -->|key and model from ignored api/.env| Groq[Groq chat completions]
  Groq -->|final content only| Route
  Route --> Compiler[Browser compileSource]
  Browser -->|GET prices and symbols| Data[Existing data routes and AGT1 files]
```

`main.py` owns the HTTP routes and local-origin CORS settings. `ai_assistant.py` defines request/response schemas, loads the current strategy-language specification into the system prompt, makes the direct HTTPX call, and converts provider failures to a friendly unavailable response. It reads only the final chat content; no reasoning field, key, or full request headers are logged or returned.

The model is selected with `GROQ_MODEL`, and the key is `GROQ_API_KEY`. Copy `api/.env.example` to `api/.env` and fill those values locally. The `.env` file is ignored by Git. Provider tests use a fake provider or HTTPX mock transport; they never call Groq.
