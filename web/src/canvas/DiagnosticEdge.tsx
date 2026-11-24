/** Purpose: draws graph wires and anchors compiler errors to the affected input edge. Connects: compiler node/port diagnostics to React Flow edge visuals. */
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { CanvasEdge } from "./model.js";

/** Draws a typed wire, with an inline code and message when the compiler rejects its destination. @example an invalid BoolSeries wire is red and labeled AT-E005. */
export function DiagnosticEdgeView(props: EdgeProps<CanvasEdge>): React.JSX.Element {
  const [path, labelX, labelY] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY });
  const diagnostic = props.data?.diagnostics[0];
  const typeClass = props.data?.graphEdge ? "edge-typed" : "";
  return <>
    <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} className={`${typeClass} ${diagnostic ? "edge-invalid" : ""}`} style={{ stroke: diagnostic ? "#be3940" : "#698179", strokeWidth: diagnostic ? 2.7 : 2 }} />
    {diagnostic && <EdgeLabelRenderer><div className="edge-diagnostic-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }} title={diagnostic.hint}><strong>{diagnostic.code}</strong> {diagnostic.message}</div></EdgeLabelRenderer>}
  </>;
}
