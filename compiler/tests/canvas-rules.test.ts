/** Purpose: proves editor connection checks reuse compiler type behavior. Connects: canvas live blocking to the authoritative type checker. */
import { describe, expect, it } from "vitest";
import { connectionDiagnostic } from "../src/canvas-rules.js";
import type { GraphEdge, StrategyGraph } from "../src/model.js";

const graph: StrategyGraph = {
  nodes: [
    { id: "price", type: "PRICE", params: { field: "close" } },
    { id: "signal", type: "GT", params: {} },
    { id: "constant", type: "CONSTANT", params: { value: 10 } },
    { id: "strategy", type: "STRATEGY", params: { position_size_pct: 100 } },
  ],
  edges: [{ from: "signal", to: "strategy", port: "entry" }],
};

/** Checks a compiler-compatible proposed edge. @example `edge("price", "signal", "a")` supplies a Series input. */
function edge(from: string, to: string, port: string): GraphEdge { return { from, to, port }; }

describe("compiler connection rules", () => {
  it("allows a Number broadcast beside a Series", () => {
    expect(connectionDiagnostic(graph, edge("price", "signal", "a"))).toBeUndefined();
    expect(connectionDiagnostic({ ...graph, edges: [...graph.edges, edge("price", "signal", "a")] }, edge("constant", "signal", "b"))).toBeUndefined();
  });

  it("refuses a BoolSeries at an SMA input using AT-E005", () => {
    const withSma: StrategyGraph = { ...graph, nodes: [...graph.nodes, { id: "sma", type: "SMA", params: { period: 10 } }] };
    expect(connectionDiagnostic(withSma, edge("signal", "sma", "input"))?.code).toBe("AT-E005");
  });

  it("refuses a Number-only math operation using AT-E010", () => {
    const withMath: StrategyGraph = { ...graph, nodes: [...graph.nodes, { id: "constant2", type: "CONSTANT", params: { value: 20 } }, { id: "add", type: "ADD", params: {} }] };
    const first = edge("constant", "add", "a");
    const second = edge("constant2", "add", "b");
    expect(connectionDiagnostic({ ...withMath, edges: [...withMath.edges, first] }, second)?.code).toBe("AT-E010");
  });
});
