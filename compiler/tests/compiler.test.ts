/** Purpose: verifies every public compiler diagnostic, deterministic AST, and randomized validity behavior. Connects: example graphs to compiler guarantees. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { compile } from "../src/index.js";
import type { StrategyGraph } from "../src/model.js";

const examples = new URL("../../spec/examples/", import.meta.url);
const validNames = ["sma_crossover", "rsi_oversold_overbought", "price_above_sma_stop"] as const;
const errorCodes = ["AT-E001", "AT-E002", "AT-E003", "AT-E004", "AT-E005", "AT-E006", "AT-E007", "AT-E008", "AT-E009", "AT-E010"] as const;

/** Reads and parses one checked-in example graph. @example `readGraph("sma_crossover.json")` returns its nodes and edges. */
function readGraph(name: string): StrategyGraph {
  return JSON.parse(readFileSync(fileURLToPath(new URL(name, examples)), "utf8")) as StrategyGraph;
}

/** Converts a compile result to the canonical JSON bytes required by `/spec/ast.md`. @example `canonicalResult(g)` ends with a newline. */
function canonicalResult(graph: StrategyGraph): string {
  const result = compile(graph, {});
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return `${JSON.stringify(result.ast, null, 2)}\n`;
}

/** Builds one generated graph in a deliberately small subset for an independent validity oracle. @example `generatedGraph(4, true, false)` has one SMA entry signal. */
function generatedGraph(period: number, cycle: boolean, disconnected: boolean, strategyCount: number, unknownType: boolean): StrategyGraph {
  const graph: { nodes: Array<{ id: string; type: string; params: Record<string, unknown> }>; edges: Array<{ from: string; to: string; port: string }> } = {
    nodes: [
      { id: "price", type: "PRICE", params: { field: "close" } },
      { id: "average", type: unknownType ? "MYSTERY" : "SMA", params: { period } },
      { id: "entry", type: "GT", params: {} },
      { id: "exit", type: "LT", params: {} },
      { id: "constant", type: "CONSTANT", params: { value: 10 } },
      { id: "strategy", type: "STRATEGY", params: {} },
    ],
    edges: [
      { from: "price", to: "average", port: "input" },
      { from: "price", to: "entry", port: "a" }, { from: "average", to: "entry", port: "b" },
      { from: "price", to: "exit", port: "a" }, { from: "average", to: "exit", port: "b" },
      { from: "entry", to: "strategy", port: "entry" }, { from: "exit", to: "strategy", port: "exit" },
    ],
  };
  if (disconnected) graph.edges = graph.edges.filter((edge) => !(edge.to === "strategy" && edge.port === "entry"));
  if (cycle) graph.edges.push({ from: "average", to: "price", port: "input" });
  if (strategyCount === 0) graph.nodes = graph.nodes.filter((node) => node.type !== "STRATEGY");
  if (strategyCount === 2) {
    graph.nodes.push({ id: "strategy2", type: "STRATEGY", params: {} });
    graph.edges.push({ from: "entry", to: "strategy2", port: "entry" }, { from: "exit", to: "strategy2", port: "exit" });
  }
  return graph;
}

/** Independently checks only the generated subset's validity conditions. @example `isGeneratedGraphValid(g)` is true when the graph has one acyclic, fully connected strategy. */
function isGeneratedGraphValid(graph: StrategyGraph): boolean {
  const strategies = graph.nodes.filter((node) => node.type === "STRATEGY");
  if (strategies.length !== 1) return false;
  const average = graph.nodes.find((node) => node.id === "average");
  if (average?.type !== "SMA" || typeof average.params.period !== "number" || average.params.period < 2 || average.params.period > 500) return false;
  const strategyEdges = graph.edges.filter((edge) => edge.to === strategies[0]?.id);
  if (strategyEdges.length !== 2 || new Set(strategyEdges.map((edge) => edge.port)).size !== 2) return false;
  if (graph.edges.some((edge) => edge.to === "price")) return false;
  return graph.nodes.every((node) => node.type !== "MYSTERY");
}

describe("compile", () => {
  it.each(errorCodes)("reports %s for its deliberately invalid graph", (code) => {
    const graph = readGraph(`invalid-${code.toLowerCase()}.json`);
    const result = compile(graph, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((item) => item.code)).toContain(code);
  });

  it.each(validNames)("compiles the %s example into its golden AST", (name) => {
    const graph = readGraph(`${name}.json`);
    const result = compile(graph, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const actual = `${JSON.stringify(result.ast, null, 2)}\n`;
    const expected = readFileSync(fileURLToPath(new URL(`${name}.ast.json`, examples)), "utf8");
    expect(actual).toBe(expected);
  });

  it("produces byte-identical canonical JSON for repeated compilation", () => {
    const graph = readGraph("sma_crossover.json");
    expect(canonicalResult(graph)).toBe(canonicalResult(graph));
  });

  it("warns and removes a node that cannot reach the strategy", () => {
    const result = compile(readGraph("unreachable-warning.json"), {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.map((warning) => warning.code)).toEqual(["AT-W001"]);
      expect(result.ast.nodes.some((node) => node.id === "unused-price")).toBe(false);
    }
  });

  it("merges identical computations and rewrites their dependent input ids", () => {
    const graph = readGraph("sma_crossover.json") as { nodes: Array<{ id: string; type: string; params: Record<string, unknown> }>; edges: Array<{ from: string; to: string; port: string }> };
    graph.nodes.push({ id: "fast-copy", type: "SMA", params: { period: 10 } });
    graph.edges.push({ from: "close", to: "fast-copy", port: "input" });
    graph.edges = graph.edges.map((edge) => edge.to === "exit" && edge.port === "a" ? { ...edge, from: "fast-copy" } : edge);
    const result = compile(graph, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast.nodes.some((node) => node.id === "fast-copy")).toBe(false);
      expect(result.ast.nodes.find((node) => node.id === "exit")?.inputs.a).toBe("fast");
    }
  });

  it("uses only documented config defaults and retains the annual risk-free fraction", () => {
    const result = compile(readGraph("sma_crossover.json"), {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ast.config.initial_capital).toBe(100_000);
      expect(result.ast.config.slippage_pct).toBe(0.05);
      expect(result.ast.config.force_close_at_end).toBe(false);
      expect(result.ast.config.trading_days_per_year).toBe(252);
      expect(result.ast.config.risk_free_rate).toBe(0.06);
      expect(result.ast.config.cost_preset).not.toHaveProperty("brokerage_max_per_order");
    }
  });

  it("rejects a supplied preset with negative fees as AT-E007", () => {
    const preset = { brokerage_flat: -1, brokerage_pct: 0, stt_buy_pct: 0, stt_sell_pct: 0, txn_pct: 0, sebi_pct: 0, stamp_buy_pct: 0, gst_pct: 0, dp_sell_flat: 0 };
    const result = compile(readGraph("sma_crossover.json"), { cost_preset: preset });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === "AT-E007" && error.port === "cost_preset.brokerage_flat")).toBe(true);
  });

  it("does not throw and agrees with an independent validity checker for random graphs", () => {
    fc.assert(fc.property(
      fc.record({ period: fc.integer({ min: 1, max: 501 }), cycle: fc.boolean(), disconnected: fc.boolean(), strategyCount: fc.constantFrom(0, 1, 2), unknownType: fc.boolean() }),
      ({ period, cycle, disconnected, strategyCount, unknownType }) => {
        const graph = generatedGraph(period, cycle, disconnected, strategyCount, unknownType);
        const shouldBeValid = isGeneratedGraphValid(graph);
        const result = compile(graph, {});
        expect(result.ok).toBe(shouldBeValid);
      },
    ), { numRuns: 300 });
  });

  it("lists only nodes that belong to a cycle", () => {
    const result = compile(readGraph("invalid-at-e004.json"), {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.filter((item) => item.code === "AT-E004").map((item) => item.nodeId)).toEqual(["a", "b"]);
  });
});
