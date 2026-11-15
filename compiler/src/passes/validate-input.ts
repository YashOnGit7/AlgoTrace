/** Purpose: validates the external AI graph envelope before any graph pass runs. Connects: untrusted graph JSON to normalized compiler input. */
import { NODE_CATALOG } from "../catalog.js";
import { diagnostic } from "../diagnostics.js";
import type { Diagnostic, GraphEdge, GraphNode, StrategyGraph, StageResult } from "../model.js";

/** Checks basic node/edge shapes, ids, node types, and strategy count. @example `validateInput(rawGraph)` returns parsed graph data and any envelope errors. */
export function validateInput(value: unknown): StageResult<StrategyGraph> {
  const errors: Diagnostic[] = [];
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return { diagnostics: [diagnostic("AT-E003", null, null, "The graph needs `nodes` and `edges` arrays.")] };
  }
  for (const key of Object.keys(value)) if (!(["nodes", "edges"] as string[]).includes(key)) errors.push(diagnostic("AT-E003", null, key, `The graph field “${key}” is not part of the compiler input format.`));
  const nodes: GraphNode[] = [];
  const ids = new Set<string>();
  for (const raw of value.nodes) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.type !== "string" || !isRecord(raw.params)) {
      errors.push(diagnostic("AT-E002", null, null, "Each node needs a string id, a type, and a params object."));
      continue;
    }
    for (const key of Object.keys(raw)) if (!(["id", "type", "params"] as string[]).includes(key)) errors.push(diagnostic("AT-E003", raw.id, key, `Node field “${key}” is not part of the compiler input format.`));
    if (ids.has(raw.id)) errors.push(diagnostic("AT-E001", raw.id));
    ids.add(raw.id);
    if (NODE_CATALOG[raw.type] === undefined) errors.push(diagnostic("AT-E002", raw.id));
    nodes.push({ id: raw.id, type: raw.type, params: raw.params });
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: GraphEdge[] = [];
  const occupiedPorts = new Set<string>();
  for (const raw of value.edges) {
    if (!isRecord(raw) || typeof raw.from !== "string" || typeof raw.to !== "string" || typeof raw.port !== "string") {
      errors.push(diagnostic("AT-E003", null, null, "Each edge needs `from`, `to`, and `port` strings."));
      continue;
    }
    for (const key of Object.keys(raw)) if (!(["from", "to", "port"] as string[]).includes(key)) errors.push(diagnostic("AT-E003", raw.to, key, `Edge field “${key}” is not part of the compiler input format.`));
    const target = nodeById.get(raw.to);
    const source = nodeById.get(raw.from);
    if (source === undefined || target === undefined || !(NODE_CATALOG[target.type]?.inputs[raw.port])) {
      errors.push(diagnostic("AT-E003", raw.to, raw.port));
      continue;
    }
    const portKey = `${raw.to}\u0000${raw.port}`;
    if (occupiedPorts.has(portKey)) errors.push(diagnostic("AT-E003", raw.to, raw.port, "An input port has more than one connection."));
    occupiedPorts.add(portKey);
    edges.push({ from: raw.from, to: raw.to, port: raw.port });
  }
  const strategyCount = nodes.filter((node) => node.type === "STRATEGY").length;
  if (strategyCount === 0) errors.push(diagnostic("AT-E008"));
  if (strategyCount > 1) errors.push(diagnostic("AT-E009"));
  return { value: { nodes, edges }, diagnostics: errors };
}

/** Tells whether an unknown JSON value is a plain object. @example `isRecord({ id: "n" })` is true. */
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
