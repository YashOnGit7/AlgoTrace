/** Purpose: coalesces identical computations after canonical input ids are known. Connects: ordered reachable graph to compact AST nodes. */
import { stableJson } from "../model.js";
import type { NormalizedNode, StageResult } from "../model.js";

/** Merges equal op/params/input computations and redirects later edges to the smallest id. @example `mergeDuplicates(ordered)` retains the lexically smaller duplicate node id. */
export function mergeDuplicates(nodes: readonly NormalizedNode[]): StageResult<NormalizedNode[]> {
  const canonical = new Map<string, string>();
  const remap = new Map<string, string>();
  const result: NormalizedNode[] = [];
  for (const original of nodes) {
    const inputs = Object.fromEntries(Object.entries(original.inputs).map(([port, id]) => [port, resolveId(id, remap)]));
    const candidate: NormalizedNode = { ...original, inputs };
    const signature = `${candidate.op}|${stableJson(candidate.params)}|${stableJson(candidate.inputs)}`;
    const existing = canonical.get(signature);
    if (existing === undefined) { canonical.set(signature, candidate.id); result.push(candidate); }
    else {
      const survivor = existing < candidate.id ? existing : candidate.id;
      const discarded = existing < candidate.id ? candidate.id : existing;
      if (survivor !== existing) {
        const position = result.findIndex((node) => node.id === existing);
        if (position >= 0) result[position] = { ...candidate, id: survivor };
        canonical.set(signature, survivor);
      }
      remap.set(discarded, survivor);
      if (discarded === existing) result.splice(result.findIndex((node) => node.id === existing), 1);
    }
    remap.set(original.id, canonical.get(signature) ?? original.id);
  }
  const rewritten = result.map((node) => ({ ...node, inputs: Object.fromEntries(Object.entries(node.inputs).map(([port, id]) => [port, resolveId(id, remap)])) }));
  return { value: rewritten, diagnostics: [] };
}

/** Follows merge aliases until the final representative id is reached. @example `resolveId("old", aliases)` returns the retained id. */
function resolveId(id: string, remap: ReadonlyMap<string, string>): string {
  let current = id;
  const seen = new Set<string>();
  while (remap.has(current) && !seen.has(current)) { seen.add(current); current = remap.get(current) ?? current; }
  return current;
}
