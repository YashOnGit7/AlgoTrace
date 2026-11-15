<!-- Purpose: records the choice of Rust for the backtest engine. Connects: engine implementation to project constraints. -->
# 001: Rust for the engine

## Context (plain words)
AlgoTrace needs a fast engine that can also run in the browser as WebAssembly.

## Options considered
- Rust, as named in the fixed stack.
- Other languages, which would change the fixed stack.

## Decision
Use Rust 2021 for the engine and compile it to WebAssembly with wasm-bindgen/wasm-pack.

## Why (beginner level)
Rust provides a compiled engine and can target WebAssembly for browser execution.

## Trade-offs
The student must learn Rust and the WebAssembly build path.

## Interview answer (30 seconds)
We chose Rust because the backtest must run efficiently in the browser through WebAssembly, while keeping the engine separate from the React interface.

