/** Purpose: owns editable graph state, compiler feedback, and undo history. Connects: React Flow events to the compiler graph format. */
import { applyEdgeChanges as applyFlowEdgeChanges, applyNodeChanges as applyFlowNodeChanges, type EdgeChange, type NodeChange } from "@xyflow/react";
import { create } from "zustand";
import { NODE_CATALOG, inferOutputTypes } from "@algotrace/compiler/canvas-rules";
import type { Diagnostic, GraphEdge, StrategyGraph } from "@algotrace/compiler";
import { acceptedInputTypes } from "@algotrace/compiler/canvas-rules";
import type { CanvasEdge, CanvasNode, GraphSnapshot } from "./model.js";
import { snapshot, toStrategyGraph } from "./model.js";

interface StrategyState {
  readonly nodes: CanvasNode[];
  readonly edges: CanvasEdge[];
  readonly unrenderedEdges: readonly GraphEdge[];
  readonly revision: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
  readonly undoStack: readonly GraphSnapshot[];
  readonly redoStack: readonly GraphSnapshot[];
  readonly pendingEdit: GraphSnapshot | null;
  addNode(op: string, position: { x: number; y: number }): void;
  updateParam(nodeId: string, key: string, value: unknown): void;
  connect(graphEdge: GraphEdge): void;
  loadGraph(graph: StrategyGraph): void;
  clearGraph(): void;
  applyNodes(changes: NodeChange<CanvasNode>[]): void;
  applyEdges(changes: EdgeChange<CanvasEdge>[]): void;
  beginEdit(): void;
  commitEdit(): void;
  setPositions(positions: ReadonlyMap<string, { x: number; y: number }>): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  undo(): void;
  redo(): void;
  setCompilerResult(diagnostics: readonly Diagnostic[], warnings: readonly Diagnostic[]): void;
  strategyGraph(): StrategyGraph;
}

/** Copies a graph snapshot to the undo stack while clearing the redo branch. @example `record(state)` creates one undo step before a node parameter changes. */
function record(state: StrategyState): Pick<StrategyState, "undoStack" | "redoStack"> {
  return { undoStack: [...state.undoStack, snapshot(state.nodes, state.edges, state.unrenderedEdges)].slice(-100), redoStack: [] };
}

/** Creates unique canvas IDs while keeping compiler IDs intact for deliberately invalid duplicate-ID examples. @example duplicate IDs render as separate selectable node cards. */
function makeCanvasNodes(graph: StrategyGraph): CanvasNode[] {
  const seen = new Map<string, number>();
  const outputs = inferOutputTypes(graph);
  return graph.nodes.map((item, index) => {
    const occurrence = seen.get(item.id) ?? 0;
    seen.set(item.id, occurrence + 1);
    const id = occurrence === 0 ? item.id : `${item.id}__duplicate${occurrence + 1}`;
    const definition = NODE_CATALOG[item.type];
    const inputTypes = Object.fromEntries(Object.entries(definition?.inputs ?? {}).map(([port, types]) => [port, acceptedInputTypes(item.type, port).length === types.length ? types : acceptedInputTypes(item.type, port)]));
    return {
      id,
      type: "strategyNode",
      position: { x: 40 + (index % 3) * 280, y: 40 + Math.floor(index / 3) * 180 },
      data: {
        graphId: item.id,
        op: item.type,
        params: { ...item.params },
        errors: [],
        warnings: [],
        portTypes: inputTypes,
        outputType: outputs.get(item.id) ?? definition?.output ?? "Series",
      },
    };
  });
}

/** Maps compiler edges onto their visible canvas node cards and named handles. @example `makeCanvasEdges(graph, nodes)[0].targetHandle` is an input-port name. */
function makeCanvasEdges(graph: StrategyGraph, nodes: readonly CanvasNode[]): CanvasEdge[] {
  const displayId = new Map<string, string>();
  for (const node of nodes) if (!displayId.has(node.data.graphId)) displayId.set(node.data.graphId, node.id);
  return graph.edges.flatMap((edge, index) => {
    const source = displayId.get(edge.from);
    const target = displayId.get(edge.to);
    if (source === undefined || target === undefined) return [];
    return [{
      id: `edge-${index}-${source}-${target}-${edge.port}`,
      source,
      sourceHandle: "output",
      target,
      targetHandle: edge.port,
      type: "diagnosticEdge",
      data: { graphEdge: { ...edge }, diagnostics: [] },
    }];
  });
}

/** Makes a unique graph node id for palette additions and duplicates. @example `newNodeId("SMA")` returns a fresh SMA-prefixed identifier. */
function newNodeId(op: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${op.toLowerCase()}-${random}`;
}

/** Builds a fully specified input-edge state from a compiler graph. @example `makeEdge({ from: "p", to: "s", port: "input" })` targets the named port. */
function makeEdge(graphEdge: GraphEdge, index: number, nodes: readonly CanvasNode[]): CanvasEdge | undefined {
  const source = nodes.find((node) => node.data.graphId === graphEdge.from);
  const target = nodes.find((node) => node.data.graphId === graphEdge.to);
  if (source === undefined || target === undefined) return undefined;
  return { id: `edge-${index}-${source.id}-${target.id}-${graphEdge.port}`, source: source.id, sourceHandle: "output", target: target.id, targetHandle: graphEdge.port, type: "diagnosticEdge", data: { graphEdge: { ...graphEdge }, diagnostics: [] } };
}

/** Creates the shared Zustand store used by canvas controls and React Flow. @example `useStrategyStore.getState().undo()` restores the previous edit. */
export const useStrategyStore = create<StrategyState>((set, get) => ({
  nodes: [], edges: [], unrenderedEdges: [], revision: 0, diagnostics: [], warnings: [], undoStack: [], redoStack: [], pendingEdit: null,
  addNode: (op, position) => set((state) => {
    const id = newNodeId(op);
    const definition = NODE_CATALOG[op];
    if (definition === undefined) return state;
    const params: Record<string, unknown> = op === "STRATEGY" ? { position_size_pct: 100 } : {};
    const graphId = id;
    const node: CanvasNode = {
      id, type: "strategyNode", position,
      data: {
        graphId, op, params, errors: [], warnings: [],
        portTypes: Object.fromEntries(Object.entries(definition.inputs).map(([port]) => [port, acceptedInputTypes(op, port)])),
        outputType: definition.output,
      },
    };
    return { ...record(state), nodes: [...state.nodes, node], revision: state.revision + 1 };
  }),
  updateParam: (nodeId, key, value) => set((state) => {
    const node = state.nodes.find((item) => item.id === nodeId);
    if (node === undefined || Object.is(node.data.params[key], value)) return state;
    const params = { ...node.data.params };
    if (value === undefined) delete params[key]; else params[key] = value;
    const nodes = state.nodes.map((item) => item.id === nodeId ? { ...item, data: { ...item.data, params } } : item);
    return { ...record(state), nodes, revision: state.revision + 1 };
  }),
  connect: (graphEdge) => set((state) => {
    if (state.edges.some((edge) => edge.data.graphEdge.to === graphEdge.to && edge.data.graphEdge.port === graphEdge.port)) return state;
    const created = makeEdge(graphEdge, state.edges.length, state.nodes);
    return created === undefined ? state : { ...record(state), edges: [...state.edges, created], revision: state.revision + 1 };
  }),
  loadGraph: (graph) => set((state) => {
    const nodes = makeCanvasNodes(graph);
    const edges = makeCanvasEdges(graph, nodes);
    const rendered = new Set(edges.map((edge) => `${edge.data.graphEdge.from}\u0000${edge.data.graphEdge.to}\u0000${edge.data.graphEdge.port}`));
    const unrenderedEdges = graph.edges.filter((edge) => !rendered.has(`${edge.from}\u0000${edge.to}\u0000${edge.port}`));
    return { ...record(state), nodes, edges, unrenderedEdges, diagnostics: [], warnings: [], revision: state.revision + 1 };
  }),
  clearGraph: () => set((state) => ({ ...record(state), nodes: [], edges: [], unrenderedEdges: [], diagnostics: [], warnings: [], revision: state.revision + 1 })),
  applyNodes: (changes) => set((state) => {
    const removed = changes.some((change) => change.type === "remove");
    const nodes = applyFlowNodeChanges(changes, state.nodes);
    if (nodes === state.nodes) return state;
    const removedIds = new Set(state.nodes.filter((node) => !nodes.some((next) => next.id === node.id)).map((node) => node.id));
    const edges = removedIds.size === 0 ? state.edges : state.edges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target));
    const removedGraphIds = new Set(state.nodes.filter((node) => removedIds.has(node.id)).map((node) => node.data.graphId));
    const unrenderedEdges = removedGraphIds.size === 0 ? state.unrenderedEdges : state.unrenderedEdges.filter((edge) => !removedGraphIds.has(edge.from) && !removedGraphIds.has(edge.to));
    return { ...(removed ? record(state) : {}), nodes, edges, unrenderedEdges, revision: state.revision + (removed ? 1 : 0) };
  }),
  applyEdges: (changes) => set((state) => {
    const removed = changes.some((change) => change.type === "remove");
    const edges = applyFlowEdgeChanges(changes, state.edges);
    if (!removed || edges.length === state.edges.length) return { edges };
    return { ...record(state), edges, revision: state.revision + 1 };
  }),
  beginEdit: () => set((state) => ({ pendingEdit: snapshot(state.nodes, state.edges, state.unrenderedEdges) })),
  commitEdit: () => set((state) => state.pendingEdit === null
    ? state
    : { undoStack: [...state.undoStack, state.pendingEdit].slice(-100), redoStack: [], pendingEdit: null }),
  setPositions: (positions) => set((state) => {
    if (!state.nodes.some((node) => {
      const next = positions.get(node.id);
      return next !== undefined && (next.x !== node.position.x || next.y !== node.position.y);
    })) return state;
    return { ...record(state), nodes: state.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })) };
  }),
  deleteSelected: () => set((state) => {
    const ids = new Set(state.nodes.filter((node) => node.selected).map((node) => node.id));
    const nodes = state.nodes.filter((node) => !ids.has(node.id));
    const edges = state.edges.filter((edge) => !edge.selected && !ids.has(edge.source) && !ids.has(edge.target));
    if (nodes.length === state.nodes.length && edges.length === state.edges.length) return state;
    const graphIds = new Set(state.nodes.filter((node) => ids.has(node.id)).map((node) => node.data.graphId));
    return { ...record(state), nodes, edges, unrenderedEdges: state.unrenderedEdges.filter((edge) => !graphIds.has(edge.from) && !graphIds.has(edge.to)), revision: state.revision + 1 };
  }),
  duplicateSelected: () => set((state) => {
    const selected = state.nodes.filter((node) => node.selected);
    if (selected.length === 0) return state;
    const ids = new Map(selected.map((node) => [node.id, newNodeId(node.data.op)]));
    const clones = selected.map((node): CanvasNode => {
      const id = ids.get(node.id) ?? newNodeId(node.data.op);
      return { ...node, id, selected: false, position: { x: node.position.x + 40, y: node.position.y + 40 }, data: { ...node.data, graphId: id, params: { ...node.data.params }, errors: [], warnings: [] } };
    });
    const cloneEdgeParts = state.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge, index) => {
      const from = ids.get(edge.source) ?? edge.source;
      const to = ids.get(edge.target) ?? edge.target;
      return makeEdge({ from, to, port: edge.data.graphEdge.port }, state.edges.length + index, [...state.nodes, ...clones]);
    }).filter((edge): edge is CanvasEdge => edge !== undefined);
    return { ...record(state), nodes: [...state.nodes, ...clones], edges: [...state.edges, ...cloneEdgeParts], revision: state.revision + 1 };
  }),
  undo: () => set((state) => {
    const previous = state.undoStack.at(-1);
    if (previous === undefined) return state;
    return { nodes: [...previous.nodes], edges: [...previous.edges], unrenderedEdges: [...previous.unrenderedEdges], undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, snapshot(state.nodes, state.edges, state.unrenderedEdges)], revision: state.revision + 1 };
  }),
  redo: () => set((state) => {
    const next = state.redoStack.at(-1);
    if (next === undefined) return state;
    return { nodes: [...next.nodes], edges: [...next.edges], unrenderedEdges: [...next.unrenderedEdges], undoStack: [...state.undoStack, snapshot(state.nodes, state.edges, state.unrenderedEdges)], redoStack: state.redoStack.slice(0, -1), revision: state.revision + 1 };
  }),
  setCompilerResult: (diagnostics, warnings) => set((state) => {
    const all = [...diagnostics, ...warnings];
    const outputTypes = inferOutputTypes(toStrategyGraph(state.nodes, state.edges, state.unrenderedEdges));
    const nodes = state.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        outputType: outputTypes.get(node.data.graphId) ?? node.data.outputType,
        errors: all.filter((item) => item.nodeId === node.data.graphId && !(item.port && state.edges.some((edge) => edge.data.graphEdge.to === item.nodeId && edge.data.graphEdge.port === item.port))),
        warnings: warnings.filter((item) => item.nodeId === node.data.graphId),
      },
    }));
    const edges = state.edges.map((edge) => ({
      ...edge,
      data: { ...edge.data, diagnostics: diagnostics.filter((item) => item.nodeId === edge.data.graphEdge.to && item.port === edge.data.graphEdge.port) },
    }));
    return { diagnostics, warnings, nodes, edges };
  }),
  strategyGraph: () => toStrategyGraph(get().nodes, get().edges, get().unrenderedEdges),
}));

/** Adapts React Flow node changes into Zustand graph updates. @example `applyNodeChanges([{ type: "position", ... }])` keeps the canvas drag state centralized. */
export function applyNodeChanges(changes: NodeChange<CanvasNode>[]): void { useStrategyStore.getState().applyNodes(changes); }

/** Adapts React Flow edge changes into Zustand graph updates. @example `applyEdgeChanges([{ type: "remove", id }])` records deletion for undo. */
export function applyEdgeChanges(changes: EdgeChange<CanvasEdge>[]): void { useStrategyStore.getState().applyEdges(changes); }
