/** Purpose: creates canonical version-1 AST objects and JSON text. Connects: checked graph output to the Rust engine input contract. */
import type { AstNode, JsonValue, NormalizedNode, StrategyAst } from "../model.js";

/** Lowers graph nodes and config into the versioned engine AST in stable key order. @example `lowerToAst(nodes, config).sink` names the STRATEGY node. */
export function lowerToAst(nodes: readonly NormalizedNode[], config: Record<string, unknown>): StrategyAst {
  const sink = nodes.find((node) => node.op === "STRATEGY");
  if (sink === undefined) throw new Error("lowerToAst requires a validated STRATEGY node");
  const sortedConfig = sortRecord(config) as unknown as StrategyAst["config"];
  const astNodes: AstNode[] = nodes.map((node) => ({
    id: node.id,
    op: node.op,
    params: sortRecord(node.params) as Readonly<Record<string, JsonValue>>,
    inputs: sortRecord(node.inputs) as Readonly<Record<string, string>>,
  }));
  return { version: 1, config: sortedConfig, nodes: astNodes, sink: sink.id };
}

/** Serializes an AST with spec-required two-space indentation and a final newline. @example `serializeAst(ast)` ends with `\n`. */
export function serializeAst(ast: StrategyAst): string {
  const ordered = { version: ast.version, config: sortRecord(ast.config), nodes: ast.nodes.map((node) => ({ id: node.id, op: node.op, params: sortRecord(node.params), inputs: sortRecord(node.inputs) })), sink: ast.sink };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Sorts an object's keys using plain string order. @example `sortRecord({ z: 0, a: 1 })` starts with key `a`. */
function sortRecord<T>(record: object): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => compare(a, b))) as Record<string, T>;
}

/** Compares strings without locale-dependent ordering. @example `compare("a", "b")` returns a negative value. */
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
