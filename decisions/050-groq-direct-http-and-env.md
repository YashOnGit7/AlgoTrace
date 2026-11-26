<!-- Purpose: records the AI provider boundary and secret configuration choice. Connects: FastAPI to Groq without exposing credentials to the browser. -->
# 050: Call Groq directly and keep settings local

## Context (plain words)
The browser needs code-writing help, but its API key must stay on the local API server. The selected model may change without editing application code.

## Options considered
- Add the provider's Python SDK and configure it in the application source.
- Use the approved HTTPX client against the chat-completions URL and read key/model from `api/.env`.

## Decision
Use `httpx==0.28.1` and `python-dotenv==1.2.4`; call Groq's compatible chat-completions endpoint directly. Load `GROQ_API_KEY` and `GROQ_MODEL` from the ignored `api/.env`, with an empty-value `api/.env.example`. Send low reasoning effort and `include_reasoning: false`; parse only the final message content. Do not log keys or full request headers. Provider requests time out after 20 seconds, and each client may make at most 20 requests per minute.

## Why (beginner level)
The browser never receives the secret, and switching between supported models only requires changing a local setting. Direct HTTP keeps the dependency list small and makes the request easy to test with a fake transport.

## Trade-offs
The project owns a small amount of HTTP request and response handling. A provider SDK would hide some of that work but add another dependency and couple the code more closely to that SDK.

## Interview answer (30 seconds)
I kept the Groq key on the API and called the compatible endpoint with HTTPX. The model name comes from an ignored local settings file, and the mock transport verifies that only final code or a question is returned.
