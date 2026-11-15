<!-- Purpose: documents the Rust backtesting engine. Connects: Strategy AST and daily bars to trades and metrics. -->
# Engine

The pure-Rust crate executes a validated strategy over one instrument's daily bars. This phase has no WebAssembly bindings or browser worker integration.

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
```

