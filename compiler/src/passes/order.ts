/** Purpose: detects cycles and emits deterministic Kahn dependency order. Connects: normalized port edges to type checking and AST output. */
import { diagnostic } from "../diagnostics.js";
import type { Diagnostic, NormalizedGraph, NormalizedNode, StageResult } from "../model.js";

/** Orders nodes with lexical-id tie breaking and reports actual cycle members. @example `orderNodes(graph)` places a ready node named `a` before `z`. */
export function orderNodes(graph: NormalizedGraph): StageResult<NormalizedNode[]> {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const node of graph.nodes) for (const sourceId of Object.values(node.inputs)) {
    indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
    outgoing.get(sourceId)?.push(node.id);
  }
  const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
  const ready = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort(compare);
  const ordered: NormalizedNode[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    const node = graph.byId.get(id);
    if (node !== undefined) ordered.push(node);
    for (const targetId of outgoing.get(id) ?? []) {
      const remaining = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, remaining);
      if (remaining === 0) { ready.push(targetId); ready.sort(compare); }
    }
  }
  if (ordered.length === graph.nodes.length) return { value: ordered, diagnostics: [] };
  const cyclic = findCycleMembers(graph.nodes, outgoing);
  const errors = cyclic.map((id) => diagnostic("AT-E004", id, null, `Cycle member: ${id}.`));
  return { diagnostics: errors.length > 0 ? errors : [diagnostic("AT-E004", null)] };
}

/** Returns nodes in strongly connected components that contain a cycle. @example `findCycleMembers(nodes, edges)` excludes downstream blocked nodes. */
function findCycleMembers(nodes: readonly NormalizedNode[], outgoing: ReadonlyMap<string, readonly string[]>): string[] {
  let nextIndex = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const members: string[] = [];
  const visit = (id: string): void => {
    index.set(id, nextIndex); low.set(id, nextIndex); nextIndex += 1; stack.push(id); onStack.add(id);
    for (const next of outgoing.get(id) ?? []) {
      if (!index.has(next)) { visit(next); low.set(id, Math.min(low.get(id) ?? 0, low.get(next) ?? 0)); }
      else if (onStack.has(next)) low.set(id, Math.min(low.get(id) ?? 0, index.get(next) ?? 0));
    }
    if (low.get(id) === index.get(id)) {
      const component: string[] = [];
      let item: string | undefined;
      do { item = stack.pop(); if (item !== undefined) { onStack.delete(item); component.push(item); } } while (item !== id);
      const selfLoop = (outgoing.get(id) ?? []).includes(id);
      if (component.length > 1 || selfLoop) members.push(...component);
    }
  };
  for (const node of nodes) if (!index.has(node.id)) visit(node.id);
  return members.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
