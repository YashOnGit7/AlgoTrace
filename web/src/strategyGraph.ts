/** Purpose: holds the one approved thin-slice strategy graph. Connects: the graph compiler to the worker backtest. */
import type { StrategyGraph } from "@algotrace/compiler";

/** Returns the reference SMA(10)/SMA(30) crossover graph. @example `referenceSmaCrossoverGraph()` has close, fast/slow SMA, crosses, and STRATEGY nodes. */
export function referenceSmaCrossoverGraph(): StrategyGraph {
  // This mirrors spec/examples/sma_crossover.json exactly so the demo stays aligned with vectorbt.
  return {
    nodes: [
      { id: "close", type: "PRICE", params: { field: "close" } },
      { id: "fast", type: "SMA", params: { period: 10 } },
      { id: "slow", type: "SMA", params: { period: 30 } },
      { id: "entry", type: "CROSSES_ABOVE", params: {} },
      { id: "exit", type: "CROSSES_BELOW", params: {} },
      { id: "strategy", type: "STRATEGY", params: { position_size_pct: 100 } },
    ],
    edges: [
      { from: "close", to: "fast", port: "input" },
      { from: "close", to: "slow", port: "input" },
      { from: "fast", to: "entry", port: "a" },
      { from: "slow", to: "entry", port: "b" },
      { from: "fast", to: "exit", port: "a" },
      { from: "slow", to: "exit", port: "b" },
      { from: "entry", to: "strategy", port: "entry" },
      { from: "exit", to: "strategy", port: "exit" },
    ],
  };
}
