<!-- Purpose: documents the Rust backtesting engine. Connects: Strategy AST and daily bars to trades and metrics. -->
# Engine

The Rust crate executes a validated strategy over one instrument's daily bars. Its `wasm_api` module exposes pointer-based browser calls, while the native engine modules remain reusable as ordinary Rust code.

```mermaid
flowchart LR
  Bytes[AGT1 byte buffer] --> View[Borrowed PriceView]
  AST[Strategy AST] --> Plan[Prepared evaluation plan]
  View --> Plan
  Plan --> Signals[Reusable number and boolean series]
  Signals --> Trading[Next-open trading loop]
  View --> Trading
  Trading --> Output[Trades and equity]
  Output --> Metrics[Return and risk metrics]
  Plan --> Sweep[Parameter sweep reuses buffers]
  View --> WasmApi[wasm-bindgen API]
  Trading --> WasmApi
  Metrics --> WasmApi
  WasmApi --> Browser[Web typed-array views]
```

The web wrapper copies AGT1 bytes into reserved WebAssembly memory one time. The Rust loader then reads those bytes in place without creating a second copy of the encoded price file. JavaScript must build fresh typed-array views after calls that may grow WebAssembly memory.

