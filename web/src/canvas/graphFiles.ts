/** Purpose: loads approved strategy examples and compiler error fixtures as graph JSON. Connects: `/spec/examples` to the editor without copying strategy definitions. */
import type { StrategyGraph } from "@algotrace/compiler";

const exampleFiles = import.meta.glob("../../../spec/examples/*.json", { eager: true, query: "?raw", import: "default" });

export const STRATEGY_TEMPLATES = [
  { id: "sma_crossover", label: "Moving-average crossover", filename: "sma_crossover.json" },
  { id: "rsi_oversold_overbought", label: "RSI oversold / overbought", filename: "rsi_oversold_overbought.json" },
  { id: "price_above_sma_stop", label: "Price above SMA with stop-loss", filename: "price_above_sma_stop.json" },
] as const;

export const ERROR_EXAMPLES = Array.from({ length: 10 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  return { code: `AT-E${number}`, filename: `invalid-at-e${number}.json` };
});

/** Reads a named compiler example as a graph; strategy definitions stay in the spec folder. @example `loadGraphFile("sma_crossover.json").nodes.length` returns the checked-in example node count. */
export function loadGraphFile(filename: string): StrategyGraph {
  const match = Object.entries(exampleFiles).find(([path]) => path.endsWith(`/${filename}`));
  if (match === undefined || typeof match[1] !== "string") throw new Error(`The checked-in graph file ${filename} is missing.`);
  const value: unknown = JSON.parse(match[1]);
  if (!isStrategyGraph(value)) throw new Error(`The checked-in graph file ${filename} has an invalid graph shape.`);
  return value;
}

/** Confirms the JSON contains the AI graph node and edge arrays before using it. @example `isStrategyGraph({ nodes: [], edges: [] })` returns true. */
function isStrategyGraph(value: unknown): value is StrategyGraph {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.nodes) && Array.isArray(record.edges);
}
