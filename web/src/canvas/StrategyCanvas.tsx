/** Purpose: provides the visual strategy editor, compiler feedback, templates, and graph file actions. Connects: the palette, Zustand graph, compiler, and React Flow canvas. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  type Connection, type OnConnectEnd, type ReactFlowInstance,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { compile, type Diagnostic, type GraphEdge } from "@algotrace/compiler";
import { connectionDiagnostic, NODE_CATALOG, type ValueType } from "@algotrace/compiler/canvas-rules";
import { CanvasNodeView } from "./CanvasNode.js";
import { DiagnosticEdgeView } from "./DiagnosticEdge.js";
import { ERROR_EXAMPLES, loadGraphFile, STRATEGY_TEMPLATES } from "./graphFiles.js";
import type { CanvasEdge, CanvasNode } from "./model.js";
import { applyEdgeChanges, applyNodeChanges, useStrategyStore } from "./store.js";
import "./canvas.css";

const nodeTypes = { strategyNode: CanvasNodeView };
const edgeTypes = { diagnosticEdge: DiagnosticEdgeView };
const NODE_GROUPS: readonly { readonly title: string; readonly operations: readonly string[] }[] = [
  { title: "Data", operations: ["PRICE", "CONSTANT"] },
  { title: "Indicators", operations: ["SMA", "EMA", "RSI"] },
  { title: "Math", operations: ["ADD", "SUB", "MUL", "DIV", "DELAY"] },
  { title: "Signals", operations: ["GT", "LT", "CROSSES_ABOVE", "CROSSES_BELOW"] },
  { title: "Logic and strategy", operations: ["AND", "OR", "NOT", "STRATEGY"] },
];
const TYPE_COLORS: Readonly<Record<ValueType, string>> = { Series: "#18a08b", BoolSeries: "#9368d7", Number: "#dc9c38" };
const NODE_WIDTH = 250;
const NODE_HEIGHT = 200;

/** Hosts a standalone React Flow provider so canvas controls can use the viewport helpers. @example `<StrategyCanvas />` shows the editor and compiler feedback. */
export function StrategyCanvas(): React.JSX.Element {
  return <ReactFlowProvider><CanvasEditor /></ReactFlowProvider>;
}

/** Connects store state to canvas events and layout. @example dropping `SMA` in the viewport creates an SMA node in Zustand. */
function CanvasEditor(): React.JSX.Element {
  const nodes = useStrategyStore((state) => state.nodes);
  const edges = useStrategyStore((state) => state.edges);
  const revision = useStrategyStore((state) => state.revision);
  const diagnostics = useStrategyStore((state) => state.diagnostics);
  const warnings = useStrategyStore((state) => state.warnings);
  const undoStack = useStrategyStore((state) => state.undoStack);
  const redoStack = useStrategyStore((state) => state.redoStack);
  const { addNode, connect, loadGraph, clearGraph, deleteSelected, duplicateSelected, undo, redo, setCompilerResult, strategyGraph, beginEdit, commitEdit, setPositions } = useStrategyStore();
  const reactFlow = useRef<ReactFlowInstance<CanvasNode, CanvasEdge> | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const rejectedConnection = useRef<Diagnostic | null>(null);
  const rejectionTimer = useRef<number | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const [compileStatus, setCompileStatus] = useState("Add nodes to start a strategy.");
  // Screen selection and compiler badges replace React Flow objects without changing the graph; revision changes only for meaningful edits.
  const currentGraph = useMemo(() => strategyGraph(), [revision, strategyGraph]);
  const diagnosticCount = diagnostics.length;

  useEffect(() => {
    const result = compile(currentGraph, { cost_preset: "zero_costs" });
    if (result.ok) {
      setCompilerResult([], result.warnings);
      setCompileStatus(result.warnings.length === 0 ? `Valid strategy · ${result.ast.nodes.length} compiled nodes` : `Valid with ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}`);
    } else {
      setCompilerResult(result.errors, []);
      const errors = result.errors.length;
      setCompileStatus(`${errors} compiler error${errors === 1 ? "" : "s"} · fix the marked node or connection`);
    }
  }, [currentGraph, revision, setCompilerResult]);

  /** Adds a node at the visible canvas center. @example `addCatalogNode("RSI")` creates a period editor in the middle of the graph. */
  const addCatalogNode = useCallback((op: string): void => {
    const bounds = document.querySelector(".flow-wrap")?.getBoundingClientRect();
    const screen = { x: (bounds?.left ?? 250) + 24, y: (bounds?.top ?? 120) + 24 };
    const origin = reactFlow.current?.screenToFlowPosition(screen) ?? { x: 100, y: 100 };
    const position = { x: origin.x + (nodes.length % 2) * 300, y: origin.y + Math.floor(nodes.length / 2) * 140 };
    addNode(op, position);
  }, [addNode]);

  /** Loads a checked-in graph and fits it into view. @example `selectTemplate("sma_crossover")` opens the spec crossover graph. */
  const selectTemplate = useCallback((filename: string, label: string): void => {
    try {
      loadGraph(loadGraphFile(filename));
      setFileMessage(`${label} loaded.`);
      setConnectionMessage(null);
      window.setTimeout(() => reactFlow.current?.fitView({ padding: 0.18, duration: 250 }), 80);
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : "The graph could not be loaded.");
    }
  }, [loadGraph]);

  /** Converts a valid React Flow connection into compiler graph IDs and refuses compiler-rejected wiring. @example a BoolSeries-to-SMA wire stays unconnected and shows AT-E005. */
  const onConnect = useCallback((connection: Connection): void => {
    if (connection.source === null || connection.target === null || connection.targetHandle === null) return;
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (source === undefined || target === undefined) return;
    const candidate: GraphEdge = { from: source.data.graphId, to: target.data.graphId, port: connection.targetHandle };
    const issue = connectionDiagnostic(currentGraph, candidate);
    if (issue !== undefined) {
      rejectedConnection.current = issue;
      setConnectionMessage(`${issue.code} (${source.data.op} → ${target.data.op}.${candidate.port}): ${issue.message} ${issue.hint}`);
      return;
    }
    connect(candidate);
    rejectedConnection.current = null;
    if (rejectionTimer.current !== null) window.clearTimeout(rejectionTimer.current);
    setConnectionMessage(null);
  }, [connect, currentGraph, nodes]);

  /** Runs the shared compiler compatibility check while a wire is being dragged. @example a Number can preview on a crossover input that accepts Series or Number. */
  const isValidConnection = useCallback((connection: Connection | CanvasEdge): boolean => {
    if (connection.source === null || connection.target === null || connection.targetHandle == null) return false;
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    const issue = source === undefined || target === undefined
      ? undefined
      : connectionDiagnostic(currentGraph, { from: source.data.graphId, to: target.data.graphId, port: connection.targetHandle });
    if (issue !== undefined) {
      rejectedConnection.current = issue;
      if (rejectionTimer.current !== null) window.clearTimeout(rejectionTimer.current);
      rejectionTimer.current = window.setTimeout(() => setConnectionMessage(`${issue.code}: ${issue.message} ${issue.hint}`), 180);
    }
    return source !== undefined && target !== undefined && issue === undefined;
  }, [currentGraph, nodes]);

  /** Shows the compiler reason after a refused drag without changing React state for every pointer-move event. @example dropping a BoolSeries onto SMA displays AT-E005. */
  const onConnectEnd = useCallback<OnConnectEnd>((_event, state): void => {
    if (state.isValid === true) {
      rejectedConnection.current = null;
      if (rejectionTimer.current !== null) window.clearTimeout(rejectionTimer.current);
      return;
    }
    const issue = rejectedConnection.current;
    if (issue !== null) {
      if (rejectionTimer.current !== null) window.clearTimeout(rejectionTimer.current);
      setConnectionMessage(`${issue.code}: ${issue.message} ${issue.hint}`);
    }
  }, []);

  /** Places a compiler issue's node or edge in the center of the viewport. @example clicking AT-E006 scrolls to its unconnected input node. */
  const focusDiagnostic = useCallback((item: Diagnostic): void => {
    const node = nodes.find((candidate) => candidate.data.graphId === item.nodeId);
    if (node !== undefined) reactFlow.current?.setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, { zoom: 1.1, duration: 250 });
  }, [nodes]);

  /** Computes left-to-right node positions with dagre while preserving graph connections. @example clicking Auto layout arranges a crossover from prices to strategy. */
  const autoLayout = useCallback((): void => {
    if (nodes.length === 0) return;
    if (edges.length === 0) {
      // Unconnected nodes have no dependency ranks, so seed a separated grid before the first wire is made.
      const positions = new Map(nodes.map((node, index) => [node.id, {
        x: 60 + (index % 2) * (NODE_WIDTH + 90),
        y: 50 + Math.floor(index / 2) * (NODE_HEIGHT + 70),
      }] as const));
      setPositions(positions);
      window.setTimeout(() => reactFlow.current?.fitView({ padding: 0.18, duration: 250 }), 80);
      return;
    }
    const layout = new dagre.graphlib.Graph();
    layout.setDefaultEdgeLabel(() => ({}));
    layout.setGraph({ rankdir: "LR", nodesep: 46, ranksep: 105, marginx: 35, marginy: 35 });
    for (const node of nodes) layout.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    for (const edge of edges) layout.setEdge(edge.source, edge.target);
    dagre.layout(layout);
    const positions = new Map(nodes.map((node) => {
      const point = layout.node(node.id) as { x: number; y: number };
      return [node.id, { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 }] as const;
    }));
    setPositions(positions);
    window.setTimeout(() => reactFlow.current?.fitView({ padding: 0.18, duration: 250 }), 80);
  }, [edges, nodes, setPositions]);

  /** Downloads only the compiler graph, excluding screen positions and selection state. @example Save graph creates a `.json` file with node and edge arrays. */
  const saveGraph = useCallback((): void => {
    const content = `${JSON.stringify(currentGraph, null, 2)}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "algotrace-strategy.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setFileMessage("Graph JSON saved.");
  }, [currentGraph]);

  /** Opens and validates the JSON envelope before showing the graph and any compiler errors. @example loading a saved graph restores its node IDs, params, and wires. */
  const loadGraphFileFromDisk = useCallback(async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (typeof value !== "object" || value === null || Array.isArray(value) || !Array.isArray((value as Record<string, unknown>).nodes) || !Array.isArray((value as Record<string, unknown>).edges)) {
        throw new Error("Choose a graph JSON file with nodes and edges arrays.");
      }
      loadGraph(value as { nodes: StrategyGraphNode[]; edges: GraphEdge[] });
      setFileMessage(`${file.name} loaded; compiler diagnostics are shown on the graph.`);
    window.setTimeout(() => reactFlow.current?.fitView({ padding: 0.18, duration: 250 }), 80);
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : "The graph file could not be read.");
    } finally {
      if (fileInput.current !== null) fileInput.current.value = "";
    }
  }, [loadGraph]);

  /** Converts a palette drag into a new node at the pointer location. @example dropping RSI places it where the user released it. */
  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const op = event.dataTransfer.getData("application/algotrace-node");
    if (NODE_CATALOG[op] === undefined) return;
    addNode(op, reactFlow.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 100, y: 100 });
  }, [addNode]);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>): void => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }, []);
  const errorItems = diagnostics.map((item, index) => ({ item, key: `error-${item.code}-${item.nodeId}-${item.port}-${index}` }));
  const warningItems = warnings.map((item, index) => ({ item, key: `warning-${item.code}-${item.nodeId}-${index}` }));
  const issueCodes = [...new Set(diagnostics.map((item) => item.code))];

  return (
    <div className="strategy-workspace">
      <header className="canvas-heading">
        <div><p className="canvas-eyebrow">Strategy builder</p><h1>Build a trading rule</h1><p>Connect typed nodes from price inputs to one strategy output. The compiler checks every edit.</p></div>
        <div className={`compile-state ${diagnosticCount === 0 ? "compile-good" : "compile-bad"}`} role="status" data-testid="compile-status">{compileStatus}</div>
      </header>
      <div className="canvas-toolbar" aria-label="Graph actions">
        <div className="toolbar-buttons">
          <button type="button" onClick={undo} disabled={undoStack.length === 0}>Undo</button>
          <button type="button" onClick={redo} disabled={redoStack.length === 0}>Redo</button>
          <button type="button" onClick={duplicateSelected} disabled={!nodes.some((node) => node.selected)}>Duplicate</button>
          <button type="button" onClick={deleteSelected} disabled={!nodes.some((node) => node.selected) && !edges.some((edge) => edge.selected)}>Delete</button>
          <button type="button" onClick={autoLayout} disabled={nodes.length < 2}>Auto layout</button>
          <button type="button" onClick={saveGraph} disabled={nodes.length === 0}>Save JSON</button>
          <button type="button" onClick={() => fileInput.current?.click()}>Load JSON</button>
          <button type="button" className="quiet-button" onClick={clearGraph} disabled={nodes.length === 0}>Clear</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => void loadGraphFileFromDisk(event.currentTarget.files?.[0])} />
        </div>
        <div className="template-buttons" aria-label="Strategy templates">
          {STRATEGY_TEMPLATES.map((template) => <button key={template.id} type="button" onClick={() => selectTemplate(template.filename, template.label)}>{template.label}</button>)}
        </div>
      </div>
      {fileMessage && <p className="canvas-feedback" role="status">{fileMessage}</p>}
      <div className="canvas-body">
        <aside className="node-palette" aria-label="Node palette">
          <div className="palette-top"><strong>Node palette</strong><span>Drag or click to add</span></div>
          {NODE_GROUPS.map((group) => <section key={group.title} className="palette-group"><h2>{group.title}</h2>
            {group.operations.map((op) => <button key={op} draggable data-testid={`palette-${op}`} onClick={() => addCatalogNode(op)} onDragStart={(event) => { event.dataTransfer.setData("application/algotrace-node", op); event.dataTransfer.effectAllowed = "copy"; }}><span className={`palette-dot type-${NODE_CATALOG[op]?.output ?? "Series"}`} />{op}<span className="palette-plus">+</span></button>)}
          </section>)}
          <section className="palette-group error-gallery"><h2>Broken examples</h2><p>Show a spec error on the graph.</p>
            <div className="error-code-grid">{ERROR_EXAMPLES.map(({ code, filename }) => <button key={code} type="button" data-testid={`broken-${code}`} onClick={() => selectTemplate(filename, `${code} broken example`)}>{code}</button>)}</div>
            <button type="button" data-testid="broken-AT-W001" onClick={() => selectTemplate("unreachable-warning.json", "AT-W001 warning example")}>AT-W001 unused-node warning</button>
          </section>
        </aside>
        <div className="canvas-main">
          <div className="flow-wrap">
            <ReactFlow<CanvasNode, CanvasEdge>
              className="strategy-flow"
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(instance) => { reactFlow.current = instance; }}
              onNodesChange={applyNodeChanges}
              onEdgesChange={applyEdgeChanges}
              onConnect={onConnect}
              onConnectStart={() => {
                rejectedConnection.current = null;
                if (rejectionTimer.current !== null) window.clearTimeout(rejectionTimer.current);
                setConnectionMessage(null);
              }}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              onNodeDragStart={beginEdit}
              onNodeDragStop={commitEdit}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodesConnectable
              elementsSelectable
              deleteKeyCode={["Delete", "Backspace"]}
              fitView
              fitViewOptions={{ padding: 0.18 }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d4dfd9" />
              <MiniMap nodeColor={(node) => TYPE_COLORS[(node.data as CanvasNode["data"]).outputType as ValueType] ?? "#91a19a"} zoomable pannable />
              <Controls />
            </ReactFlow>
            {nodes.length === 0 && <div className="empty-canvas" data-testid="empty-canvas"><strong>Start with a price node</strong><span>Drag or click items in the palette, then connect their ports.</span></div>}
          </div>
          {connectionMessage && <p className="connection-rejected" role="alert" data-testid="connection-error">{connectionMessage}</p>}
          <CompilerIssues errors={errorItems} warningItems={warningItems} onFocus={focusDiagnostic} />
          <p className="canvas-legend"><span><i className="type-Series" />Series</span><span><i className="type-BoolSeries" />BoolSeries</span><span><i className="type-Number" />Number</span><span>Lines show data flow from output to named input.</span></p>
          {issueCodes.length > 0 && <span className="visually-hidden" data-testid="visible-error-codes">{issueCodes.join(",")}</span>}
          {warnings.length > 0 && <span className="visually-hidden" data-testid="visible-warning-codes">{[...new Set(warnings.map((item) => item.code))].join(",")}</span>}
        </div>
      </div>
    </div>
  );
}

interface StrategyGraphNode { readonly id: string; readonly type: string; readonly params: Readonly<Record<string, unknown>> }
interface IssueEntry { readonly item: Diagnostic; readonly key: string }

/** Shows every blocking compiler message with a control that focuses its graph location. @example clicking an edge error moves that edge's target node into view. */
function CompilerIssues({ errors, warningItems, onFocus }: { readonly errors: readonly IssueEntry[]; readonly warningItems: readonly IssueEntry[]; readonly onFocus: (item: Diagnostic) => void }): React.JSX.Element {
  return <section className="compiler-issues" aria-label="Compiler diagnostics" data-testid="compiler-issues">
    <div className="issues-heading"><div><h2>Compiler feedback</h2><p>Updated as the graph changes</p></div><span>{errors.length} errors · {warningItems.length} warnings</span></div>
    {errors.length === 0 && warningItems.length === 0 && <p className="no-issues">No compiler errors or warnings.</p>}
    {errors.map(({ item, key }) => <IssueRow key={key} item={item} onFocus={onFocus} />)}
    {warningItems.map(({ item, key }) => <IssueRow key={key} item={item} onFocus={onFocus} warning />)}
  </section>;
}

/** Renders a friendly error or warning at the node or input port named by the compiler. @example `AT-E007` shows its allowed-range hint beside the selected node. */
function IssueRow({ item, onFocus, warning = false }: { readonly item: Diagnostic; readonly onFocus: (item: Diagnostic) => void; readonly warning?: boolean }): React.JSX.Element {
  const location = item.nodeId === null ? "Whole graph" : `${item.nodeId}${item.port ? ` · ${item.port} input` : ""}`;
  return <button type="button" className={`issue-row ${warning ? "issue-warning" : "issue-error"}`} onClick={() => onFocus(item)}>
    <strong>{item.code}</strong><span><b>{location}</b>{item.message}<small>{item.hint}</small></span>
  </button>;
}
