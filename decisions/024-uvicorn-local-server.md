<!-- Purpose: records the ASGI server used to run the local FastAPI app. Connects: the API to the developer's browser during the demo. -->
# 024: Uvicorn for the local API server

## Context (plain words)
FastAPI defines HTTP routes, but it needs a server process to listen for browser requests. The repository's Python requirements did not include one.

## Options considered
- Add Uvicorn as the local ASGI server.
- Use another HTTP server implementation or leave the API without a runnable local command.

## Decision
Pin `uvicorn==0.54.0` in `api/requirements.txt`. Use it only to run the API locally for development and the demo; it is not a production deployment choice or an additional application service.

## Why (beginner level)
FastAPI describes what should happen when a request arrives. Uvicorn opens the local port and passes those requests to FastAPI so the browser can reach routes such as `/api/symbols`.

## Trade-offs
There is one pinned runtime package to install. The app now has a direct, repeatable local server command and can be checked in a browser.

## Interview answer (30 seconds)
FastAPI supplies the application routes, while Uvicorn is the small ASGI server that runs them on localhost. We pin its version and use it only for the local demo; it adds no cache or database service.
