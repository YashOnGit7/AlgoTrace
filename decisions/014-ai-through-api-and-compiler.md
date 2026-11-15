<!-- Purpose: records the AI security and validation path. Connects: user language to safe strategy graph execution. -->
# 014: AI called only through FastAPI and checked by the compiler

## Context (plain words)
The browser must not receive the AI secret, and generated graphs must be validated.

## Options considered
- Call the model in the browser and trust its output.
- Proxy through FastAPI and run the graph through the compiler.

## Decision
AI calls go only through FastAPI. Every returned graph is checked by the TypeScript compiler before execution.

## Why (beginner level)
The key stays on the backend and the compiler checks that the graph follows project rules.

## Trade-offs
The demo needs the API service and model credentials for AI features.

## Interview answer (30 seconds)
The API keeps the model key out of browser code. Model output is only a proposed graph; the compiler validates it before it reaches the engine.

