<!-- Purpose: records the page/worker result protocol. Connects: API bytes and compiled AST to UI-owned results. -->
# 035: Typed page and worker protocol

## Context (plain words)
The browser must keep large input and result arrays off the React message path while the engine runs away from the screen thread.

## Options considered
- Send price and result arrays through normal structured cloning.
- Transfer ArrayBuffers between the page and a dedicated worker, copying only when crossing into or out of WASM memory.

## Decision
The page sends a typed `load-and-run` request with the API ArrayBuffer, compiled AST, run id, and warm-up flag, transferring ownership of the price buffer. The worker writes the bytes once into WASM. It copies equity, timestamps, and trade columns to owned buffers before transferring them back. Metric values use a Float64Array plus a Uint8Array validity mask so null metrics remain null without NaN sentinels. The page terminates the worker when it unmounts.

## Why (beginner level)
Transferable buffers move ownership between threads instead of asking the browser to clone thousands of values. Typed messages make each side agree on what fields it sends and receives.

## Trade-offs
The worker copies result arrays out because its WASM memory cannot be transferred. Metrics need a small validity mask because a number array cannot hold JSON null.

## Interview answer (30 seconds)
The API response ArrayBuffer is transferred into a worker and copied once into WASM memory. The worker copies results into standalone typed arrays and transfers those buffers back, keeping chart work on the main thread and backtest work off it.
