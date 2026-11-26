/** Purpose: renders every supported strategy operation with typed ports and bounded parameter editors. Connects: compiler catalogue rules to React Flow node UI. */
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { useEffect } from "react";
import type { CanvasNode } from "./model.js";
import { useStrategyStore } from "./store.js";

interface ParameterRule { readonly key: string; readonly label: string; readonly min?: number; readonly max?: number; readonly step?: number | "any"; readonly optional?: boolean; readonly kind?: "field" | "number" }

const PARAMETER_RULES: Readonly<Record<string, readonly ParameterRule[]>> = {
  PRICE: [{ key: "field", label: "Price field", kind: "field" }],
  CONSTANT: [{ key: "value", label: "Value", kind: "number", step: "any" }],
  SMA: [{ key: "period", label: "Period", min: 2, max: 500, step: 1 }],
  EMA: [{ key: "period", label: "Period", min: 2, max: 500, step: 1 }],
  RSI: [{ key: "period", label: "Period", min: 2, max: 200, step: 1 }],
  DELAY: [{ key: "bars", label: "Bars", min: 1, max: 50, step: 1 }],
  STRATEGY: [
    { key: "position_size_pct", label: "Position size %", min: 1, max: 100, step: 1 },
    { key: "stop_loss_pct", label: "Stop-loss %", min: 0.1, max: 50, step: 0.1, optional: true },
    { key: "take_profit_pct", label: "Take-profit %", min: 0.1, max: 500, step: 0.1, optional: true },
  ],
};

const OPERATION_NAMES: Readonly<Record<string, string>> = {
  PRICE: "Price", CONSTANT: "Constant", SMA: "Simple moving average", EMA: "Exponential moving average", RSI: "Relative strength index",
  ADD: "Add", SUB: "Subtract", MUL: "Multiply", DIV: "Divide", DELAY: "Delay", GT: "Greater than", LT: "Less than",
  CROSSES_ABOVE: "Crosses above", CROSSES_BELOW: "Crosses below", AND: "AND", OR: "OR", NOT: "NOT", STRATEGY: "Strategy",
};

/** Draws one typed graph node and its own compiler messages. @example a selected RSI node shows a period editor and Series/BoolSeries connection handles. */
export function CanvasNodeView({ id, data, selected }: NodeProps<CanvasNode>): React.JSX.Element {
  const updateParam = useStrategyStore((state) => state.updateParam);
  const updateNodeInternals = useUpdateNodeInternals();
  const inputPorts = Object.keys(data.portTypes);
  const title = OPERATION_NAMES[data.op] ?? data.op;
  const rules = PARAMETER_RULES[data.op] ?? [];
  const described = describePorts(data.op);
  const handleColor = (types: readonly string[]): string => types.length === 1 ? `type-${types[0]}` : "type-mixed";

  useEffect(() => { updateNodeInternals(id); }, [data.errors.length, data.op, data.warnings.length, id, inputPorts.length, updateNodeInternals]);

  return (
    <article className={`strategy-node ${selected ? "is-selected" : ""} ${data.errors.length || data.sourceError ? "has-error" : ""} ${data.readOnly ? "is-read-only" : ""}`} data-testid={`canvas-node-${data.op}`}>
      {inputPorts.map((port, index) => (
        <div className="input-port-row" key={port}>
          <Handle id={port} type="target" position={Position.Left} className={`port-handle ${handleColor(data.portTypes[port] ?? [])}`} style={{ top: 54 + index * 25 }} />
          <span className={`port-type-pill ${handleColor(data.portTypes[port] ?? [])}`} style={{ top: 45 + index * 25 }}>{port} · {(data.portTypes[port] ?? []).join(" / ")}</span>
        </div>
      ))}
      <header className="strategy-node-header">
        <span className={`output-type-dot type-${data.outputType}`} title={`Output: ${data.outputType}`} />
        <div><strong>{title}</strong><small>{data.op}</small></div>
        {data.errors.length > 0 && <span className="node-count error-count" aria-label={`${data.errors.length} errors`}>{data.errors.length} error</span>}
        {data.errors.length === 0 && data.warnings.length > 0 && <span className="node-count warning-count" aria-label={`${data.warnings.length} warnings`}>{data.warnings.length} warning</span>}
      </header>
      <div className="strategy-node-ports">{described}</div>
      {data.readOnly && rules.length > 0 && <p className="readonly-params">{rules.filter((rule) => data.params[rule.key] !== undefined).map((rule) => `${rule.label}: ${String(data.params[rule.key])}`).join(" · ")}</p>}
      {!data.readOnly && rules.length > 0 && <div className="node-parameters">{rules.map((rule) => (
        <ParameterEditor key={rule.key} nodeId={id} value={data.params[rule.key]} rule={rule} onChange={(value) => updateParam(id, rule.key, value)} />
      ))}</div>}
      {(data.errors.length > 0 || data.warnings.length > 0) && <div className="node-diagnostics">
        {data.errors.map((diagnostic, index) => <p key={`${diagnostic.code}-${index}`} title={diagnostic.hint}><strong>{diagnostic.code}</strong> {diagnostic.message} <em>{diagnostic.hint}</em></p>)}
        {data.warnings.map((diagnostic, index) => <p key={`${diagnostic.code}-${index}`} className="warning-text" title={diagnostic.hint}><strong>{diagnostic.code}</strong> {diagnostic.message} <em>{diagnostic.hint}</em></p>)}
      </div>}
      <Handle id="output" type="source" position={Position.Right} className={`port-handle output-handle type-${data.outputType}`} />
    </article>
  );
}

/** Displays a parameter with spec bounds and clamps a completed edit on blur. @example SMA period displays `2–500` and cannot be left outside that range. */
function ParameterEditor({ nodeId, value, rule, onChange }: { readonly nodeId: string; readonly value: unknown; readonly rule: ParameterRule; readonly onChange: (value: unknown) => void }): React.JSX.Element {
  const numberValue = typeof value === "number" ? value : "";
  if (rule.kind === "field") return <label className="parameter-control"><span>{rule.label}</span><select className="nodrag" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.currentTarget.value)}>
    <option value="">Choose field</option><option value="open">open</option><option value="high">high</option><option value="low">low</option><option value="close">close</option><option value="volume">volume</option>
  </select></label>;
  return <label className="parameter-control"><span>{rule.label}{rule.optional ? " · Off when empty" : ""}</span>
    <input className="nodrag" type="number" min={rule.min} max={rule.max} step={rule.step ?? "any"} value={numberValue} placeholder={rule.optional ? "Off" : "Required"}
      onChange={(event) => {
        const text = event.currentTarget.value;
        onChange(text === "" ? (rule.optional ? undefined : "") : Number(text));
      }}
      onBlur={(event) => {
        if (event.currentTarget.value.trim() === "") return;
        const entered = Number(event.currentTarget.value);
        if (!Number.isFinite(entered)) return;
        const bounded = Math.min(rule.max ?? Number.POSITIVE_INFINITY, Math.max(rule.min ?? Number.NEGATIVE_INFINITY, entered));
        const rounded = rule.step === 1 ? Math.round(bounded) : bounded;
        if (rounded !== entered) onChange(rounded);
      }}
    />
    {rule.min !== undefined && rule.max !== undefined && <small>Allowed: {rule.min} to {rule.max}</small>}
  </label>;
}

/** Explains a node's typed input and output in short catalogue language. @example `describePorts("STRATEGY")` lists its Boolean signal inputs. */
function describePorts(op: string): string {
  if (op === "PRICE" || op === "CONSTANT") return `Output: ${op === "PRICE" ? "Series" : "Number"}`;
  if (["SMA", "EMA", "RSI"].includes(op)) return "Series → Series";
  if (op === "DELAY") return "Series or BoolSeries → same type";
  if (["GT", "LT", "CROSSES_ABOVE", "CROSSES_BELOW"].includes(op)) return "Series/Number → BoolSeries";
  if (["AND", "OR", "NOT"].includes(op)) return "BoolSeries → BoolSeries";
  if (op === "STRATEGY") return "BoolSeries signals → strategy";
  return "Series/Number math → Series";
}
