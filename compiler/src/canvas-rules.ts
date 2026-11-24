/** Purpose: exposes compiler-owned port compatibility for interactive graph editors. Connects: React Flow connection checks to the same catalogue and type pass used by compile(). */
import { NODE_CATALOG, type ValueType } from "./catalog.js";
import { validateInput } from "./passes/validate-input.js";
import { normalizeGraph } from "./passes/normalize.js";
import { orderNodes } from "./passes/order.js";
import { checkTypes } from "./passes/type-check.js";
import type { Diagnostic, GraphEdge, StrategyGraph } from "./model.js";

export { NODE_CATALOG };
export type { ValueType };

/** Returns the compiler diagnostic that would make a proposed graph edge illegal, or undefined if its known types are compatible. @example `connectionDiagnostic(graph, edge)?.code` is `AT-E005` for a Boolean signal plugged into an SMA. */
export function connectionDiagnostic(graph: StrategyGraph, candidate: GraphEdge): Diagnostic | undefined {
  const target = graph.nodes.find((node) => node.id === candidate.to);
  const source = graph.nodes.find((node) => node.id === candidate.from);
  if (target === undefined || source === undefined || NODE_CATALOG[target.type]?.inputs[candidate.port] === undefined) {
    return { code: "AT-E003", nodeId: candidate.to, port: candidate.port, message: "This connection does not match an available input port.", hint: "Choose an existing node and an input port shown on its left side." };
  }
  const extended: StrategyGraph = { nodes: graph.nodes, edges: [...graph.edges, candidate] };
  const input = validateInput(extended);
  const malformedEdge = input.diagnostics.find((item) => item.code === "AT-E003" && item.nodeId === candidate.to && item.port === candidate.port);
  if (malformedEdge !== undefined) return malformedEdge;
  if (input.value === undefined) return input.diagnostics[0];
  const normalized = normalizeGraph(input.value);
  if (normalized.value === undefined) return normalized.diagnostics[0];
  const ordered = orderNodes(normalized.value);
  if (ordered.value === undefined) {
    return ordered.diagnostics.find((item) => item.nodeId === candidate.from || item.nodeId === candidate.to) ?? ordered.diagnostics[0];
  }
  const typed = checkTypes(ordered.value);
  // The regular compiler pass is the single authority for type mismatch and Number broadcasting rules.
  return typed.diagnostics.find((item) =>
    item.nodeId === candidate.to
    && ((item.code === "AT-E005" && item.port === candidate.port) || item.code === "AT-E010"),
  );
}

/** Lists the accepted source value types at one compiler-defined input port. @example `acceptedInputTypes("SMA", "input")` returns `Series`. */
export function acceptedInputTypes(op: string, port: string): readonly ValueType[] {
  return NODE_CATALOG[op]?.inputs[port] ?? [];
}

/** Infers graph node output types through the compiler's normal ordering and type pass. @example `inferOutputTypes(graph).get("fast")` is `Series` when fast is an SMA. */
export function inferOutputTypes(graph: StrategyGraph): ReadonlyMap<string, ValueType> {
  const input = validateInput(graph);
  if (input.value === undefined) return new Map();
  const normalized = normalizeGraph(input.value);
  if (normalized.value === undefined) return new Map();
  const ordered = orderNodes(normalized.value);
  if (ordered.value === undefined) return new Map();
  return checkTypes(ordered.value).value ?? new Map();
}
