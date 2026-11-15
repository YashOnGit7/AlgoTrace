<!-- Purpose: records the browser-to-WASM memory contract. Connects: wasm-bindgen exports to the TypeScript client. -->
# 020: Pointer-based WASM result API

**Status: ACCEPTED**

## Context (plain words)
The browser needs to provide a frozen price file to Rust and read back an equity curve, trades, metrics, and sweep summaries. Passing every large result as JSON would add conversions and copies.

## Options considered
- Pass all input and output values through JSON strings.
- Reserve WASM memory for prices and return pointer/length pairs for numeric outputs.

## Decision
Use wasm-bindgen functions to reserve/free one AGT1 price buffer, run backtests from AST JSON, expose equity and columnar trade arrays by pointer and length, return metrics JSON, and execute sweeps with JSON metric summaries. The web client copies the encoded prices into WASM once; the Rust engine reads those bytes in place. It recreates typed-array views from the current memory buffer after calls that may grow WASM memory.

## Why (beginner level)
The browser can write the input once and Rust can reuse those stored bytes. Separate numeric columns are easy for charts and tables to read, while small summaries remain convenient as JSON.

## Trade-offs
The pointer contract is fast and compact, but each pointer is valid only while the owning result allocation remains unchanged. JavaScript must refresh views after memory growth and before reading a replaced result.

## Interview answer (30 seconds)
We reserve WASM memory for the encoded prices, copy them there once, and let Rust read them in place. Results use pointer-and-length typed arrays with trades stored by column, while metrics and sweep summaries use JSON. Because WASM memory can grow, the TypeScript wrapper creates fresh views from the current memory buffer after calls that may allocate.
