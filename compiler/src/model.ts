/** Purpose: declares compiler inputs, intermediate nodes, diagnostics, and AST results. Connects: the AI graph format to the emitted engine AST. */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export interface GraphNode { readonly id: string; readonly type: string; readonly params: Readonly<Record<string, unknown>> }
export interface GraphEdge { readonly from: string; readonly to: string; readonly port: string }
export interface StrategyGraph { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] }
export interface CompileConfig {
  readonly initial_capital?: number;
  readonly slippage_pct?: number;
  readonly force_close_at_end?: boolean;
  readonly trading_days_per_year?: number;
  readonly risk_free_rate?: number;
  readonly cost_preset?: string | Readonly<Record<string, unknown>>;
}
export interface AstConfig {
  readonly initial_capital: number;
  readonly slippage_pct: number;
  readonly cost_preset: Readonly<Record<string, number | null>>;
  readonly force_close_at_end: boolean;
  readonly risk_free_rate: number;
  readonly trading_days_per_year: number;
}
export interface AstNode { readonly id: string; readonly op: string; readonly params: Readonly<Record<string, JsonValue>>; readonly inputs: Readonly<Record<string, string>> }
export interface StrategyAst { readonly version: 1; readonly config: AstConfig; readonly nodes: readonly AstNode[]; readonly sink: string }
export type DiagnosticCode = "AT-E001" | "AT-E002" | "AT-E003" | "AT-E004" | "AT-E005" | "AT-E006" | "AT-E007" | "AT-E008" | "AT-E009" | "AT-E010" | "AT-W001";
export interface Diagnostic { readonly code: DiagnosticCode; readonly message: string; readonly nodeId: string | null; readonly port: string | null; readonly hint: string }
export interface CompileSuccess { readonly ok: true; readonly ast: StrategyAst; readonly warnings: readonly Diagnostic[] }
export interface CompileFailure { readonly ok: false; readonly errors: readonly Diagnostic[] }
export type CompileResult = CompileSuccess | CompileFailure;
export interface NormalizedNode { readonly id: string; readonly op: string; readonly params: Record<string, unknown>; readonly inputs: Record<string, string> }
export interface NormalizedGraph { readonly nodes: NormalizedNode[]; readonly byId: Map<string, NormalizedNode>; readonly warnings: Diagnostic[] }
export interface StageResult<T> { readonly value?: T; readonly diagnostics: Diagnostic[] }

/** Returns a recursively key-sorted JSON representation for deterministic comparisons. @example `stableJson({ b: 1, a: 2 })` returns `{"a":2,"b":1}`. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

