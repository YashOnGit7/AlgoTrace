/** Purpose: removes nodes that cannot affect the single strategy result. Connects: validated ordered graph to a minimal executable graph. */
import { diagnostic } from "../diagnostics.js";
import type { Diagnostic, NormalizedNode, StageResult } from "../model.js";

/** Keeps the STRATEGY node and all of its ancestors, warning for every removed node. @example `pruneUnreachable(nodes)` drops an unattached PRICE node with AT-W001. */
export function pruneUnreachable(nodes: readonly NormalizedNode[]): StageResult<NormalizedNode[]> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sink = nodes.find((node) => node.op === "STRATEGY");
  if (sink === undefined) return { value: [...nodes], diagnostics: [] };
  const reachable = new Set<string>();
  const visit = (id: string): void => { if (reachable.has(id)) return; reachable.add(id); const node = byId.get(id); if (node) Object.values(node.inputs).forEach(visit); };
  visit(sink.id);
  const retained = nodes.filter((node) => reachable.has(node.id));
  const warnings: Diagnostic[] = nodes.filter((node) => !reachable.has(node.id)).map((node) => diagnostic("AT-W001", node.id));
  return { value: retained, diagnostics: warnings };
}
