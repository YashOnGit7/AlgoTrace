/** Purpose: defines the canvas node and edge state shared by editor components. Connects: compiler graph fields to React Flow screen positions and diagnostics. */
import type { Edge, Node } from "@xyflow/react";
import type { Diagnostic, GraphEdge, StrategyGraph } from "@algotrace/compiler";

export interface CanvasNodeData extends Record<string, unknown> {
  readonly graphId: string;
  readonly op: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly errors: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
  readonly portTypes: Readonly<Record<string, readonly string[]>>;
  readonly outputType: string;
  readonly readOnly?: boolean;
  readonly sourceError?: boolean;
}

export interface CanvasEdgeData extends Record<string, unknown> {
  readonly graphEdge: GraphEdge;
  readonly diagnostics: readonly Diagnostic[];
}

export type CanvasNode = Node<CanvasNodeData, "strategyNode">;
export type CanvasEdge = Edge<CanvasEdgeData, "diagnosticEdge"> & { readonly data: CanvasEdgeData };

export interface GraphSnapshot {
  readonly nodes: readonly CanvasNode[];
  readonly edges: readonly CanvasEdge[];
  readonly unrenderedEdges: readonly GraphEdge[];
}

/** Builds the exact graph payload expected by `compile()`, omitting canvas layout and diagnostics. @example `toStrategyGraph(nodes, edges).edges[0]` contains only `from`, `to`, and `port`. */
export function toStrategyGraph(nodes: readonly CanvasNode[], edges: readonly CanvasEdge[], unrenderedEdges: readonly GraphEdge[] = []): StrategyGraph {
  return {
    nodes: nodes.map((node) => ({ id: node.data.graphId, type: node.data.op, params: node.data.params })),
    edges: [...edges.map((edge) => edge.data.graphEdge), ...unrenderedEdges],
  };
}

/** Creates a copied snapshot for undo without sharing mutable data objects with later edits. @example `snapshot(nodes, edges).nodes` is safe to restore after typing. */
export function snapshot(nodes: readonly CanvasNode[], edges: readonly CanvasEdge[], unrenderedEdges: readonly GraphEdge[] = []): GraphSnapshot {
  return {
    nodes: nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, params: { ...node.data.params }, errors: [...node.data.errors], warnings: [...node.data.warnings] } })),
    edges: edges.map((edge) => ({ ...edge, data: { ...edge.data, graphEdge: { ...edge.data.graphEdge }, diagnostics: [...edge.data.diagnostics] } })),
    unrenderedEdges: unrenderedEdges.map((edge) => ({ ...edge })),
  };
}
