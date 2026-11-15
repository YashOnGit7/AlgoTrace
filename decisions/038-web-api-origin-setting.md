<!-- Purpose: records how the local frontend locates the API. Connects: Vite configuration to FastAPI CORS. -->
# 038: Configurable local API origin

## Context (plain words)
The browser needs the API address, and browsers block cross-origin reads unless the API explicitly allows the page's origin.

## Options considered
- Hardcode one API URL in the page.
- Read a Vite environment variable with the agreed local default and keep CORS limited to the two dev origins.

## Decision
Read `VITE_API_URL`, defaulting to `http://127.0.0.1:8000`, and list the variable in `.env.example`. Keep the API CORS origins exactly `http://127.0.0.1:5173` and `http://localhost:5173`; the browser test checks that the exposed `X-Bar-Count` header is readable from both.

## Why (beginner level)
Environment configuration lets the same frontend point to another local API port without editing code. A narrow origin list allows the demo pages while rejecting unrelated websites.

## Trade-offs
Vite variables are public browser settings, not secrets. A different web origin requires a deliberate API CORS change.

## Interview answer (30 seconds)
The frontend reads its API base from `VITE_API_URL` with a local fallback. FastAPI only permits the localhost and loopback Vite origins, and the Playwright browser checks the response header is exposed.
