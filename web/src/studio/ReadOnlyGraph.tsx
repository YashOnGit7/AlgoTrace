/** Purpose: lays out compiler graphs for the source editor's read-only diagram. Connects: Strategy AST-source graph data to the existing canvas node renderer. */
import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react";
import type { Diagnostic, SourceSpan, StrategyGraph } from "@algotrace/compiler";
import { NODE_CATALOG } from "@algotrace/compiler/canvas-rules";
import { CanvasNodeView } from "../canvas/CanvasNode.js";
import { DiagnosticEdgeView } from "../canvas/DiagnosticEdge.js";
import type { CanvasEdge, CanvasNode } from "../canvas/model.js";
import "@xyflow/react/dist/style.css";
import "../canvas/canvas.css";

const nodeTypes = { strategyNode: CanvasNodeView };
const edgeTypes = { diagnosticEdge: DiagnosticEdgeView };

interface ReadOnlyGraphProps {
  readonly graph: StrategyGraph;
  readonly diagnostics: readonly Diagnostic[];
  readonly sourceMap: Readonly<Record<string, SourceSpan>>;
}

/** Renders a safe, non-editable graph preview and highlights compiler-rejected nodes. @example `<ReadOnlyGraph graph={graph} diagnostics={[]} sourceMap={{}} />` displays the strategy shape. */
export function ReadOnlyGraph({ graph, diagnostics, sourceMap }: ReadOnlyGraphProps): React.JSX.Element {
  const rendered = useMemo(() => convertGraph(graph, diagnostics, sourceMap), [graph, diagnostics, sourceMap]);
  if (graph.nodes.length === 0) return <p className="studio-graph-message" role="status">The graph preview will appear once the code has enough structure to draw.</p>;
  return <div className="studio-graph-canvas" data-testid="studio-graph-preview">
    <ReactFlow<CanvasNode, CanvasEdge> nodes={rendered.nodes} edges={rendered.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      nodesConnectable={false} nodesDraggable={false} elementsSelectable={false} nodesFocusable={false} edgesFocusable={false}
      panOnDrag zoomOnScroll fitView fitViewOptions={{ padding: 0.16 }} proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d4dfd9" />
    </ReactFlow>
  </div>;
}

/** Converts a compiler graph to read-only React Flow cards and a stable left-to-right layout. @example `convertGraph(graph, [], {}).nodes.length` matches graph node count. */
function convertGraph(graph: StrategyGraph, diagnostics: readonly Diagnostic[], sourceMap: Readonly<Record<string, SourceSpan>>): { readonly nodes: CanvasNode[]; readonly edges: CanvasEdge[] } {
  const errorsByNode = new Map<string, Diagnostic[]>();
  for (const item of diagnostics) if (item.nodeId !== null) errorsByNode.set(item.nodeId, [...(errorsByNode.get(item.nodeId) ?? []), item]);
  const layout = new dagre.graphlib.Graph();
  layout.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 62, marginx: 28, marginy: 28 });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const item of graph.nodes) layout.setNode(item.id, { width: 238, height: 158 });
  for (const edge of graph.edges) if (graph.nodes.some((node) => node.id === edge.from) && graph.nodes.some((node) => node.id === edge.to)) layout.setEdge(edge.from, edge.to);
  dagre.layout(layout);
  const nodes: CanvasNode[] = graph.nodes.map((item) => {
    const definition = NODE_CATALOG[item.type];
    const position = layout.node(item.id) ?? { x: 120, y: 80 };
    const sourceSpan = sourceMap[item.id];
    const locationErrors = diagnostics.filter((error) => "line" in error && typeof error.line === "number" && sourceSpan?.line === error.line);
    return {
      id: item.id, type: "strategyNode", position: { x: position.x - 119, y: position.y - 79 },
      data: { graphId: item.id, op: item.type, params: item.params, errors: errorsByNode.get(item.id) ?? [], warnings: [],
        portTypes: definition?.inputs ?? {}, outputType: definition?.output ?? "Series", readOnly: true, sourceError: locationErrors.length > 0 },
    };
  });
  const edges: CanvasEdge[] = graph.edges.filter((edge) => graph.nodes.some((node) => node.id === edge.from) && graph.nodes.some((node) => node.id === edge.to)).map((edge, index) => ({
    id: `studio-edge-${index}`, source: edge.from, target: edge.to, sourceHandle: "output", targetHandle: edge.port, type: "diagnosticEdge",
    data: { graphEdge: edge, diagnostics: [] }, selectable: false, focusable: false,
  } as CanvasEdge));
  return { nodes, edges };
}
