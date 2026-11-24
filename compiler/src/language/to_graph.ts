/** Purpose: validates language semantics and lowers syntax trees into AI graph JSON. Connects: parsed source to compile(graph, config). */
import type { GraphEdge, GraphNode, StrategyGraph } from "../model.js";
import type { Expr, SourceDiagnostic, SourceSpan, Statement } from "./model.js";

export interface SourceMap { readonly [nodeId: string]: SourceSpan }
export interface GraphResult { readonly graph?: StrategyGraph; readonly sourceMap: SourceMap; readonly diagnostics: readonly SourceDiagnostic[] }
const ranges: Readonly<Record<string, readonly [number, number]>> = { sma: [2, 500], ema: [2, 500], rsi: [2, 200], delay: [1, 50] };
const reserved = new Set(["strategy", "buy", "sell", "when", "size", "stop_loss", "take_profit", "and", "or", "not", "open", "high", "low", "close", "volume", "sma", "ema", "rsi", "delay", "crosses_above", "crosses_below"]);

/** Converts valid statements into deterministic nodes and edges, retaining each node's source span. @example `toGraph(statements).graph?.nodes[0]?.id` is `n1`. */
export function toGraph(statements: readonly Statement[], endSpan?: SourceSpan): GraphResult {
  const diagnostics: SourceDiagnostic[] = [], nodes: GraphNode[] = [], edges: GraphEdge[] = [], sourceMap: Record<string, SourceSpan> = {};
  const assigned = new Map<string, string>(); const prices = new Map<string, string>(); const rules = new Map<string, string>(); const settings = new Map<string, Statement & { readonly kind: "setting" }>();
  let next = 1, titleSeen = false, titleEligible = true;
  const issue = (code: SourceDiagnostic["code"], span: SourceSpan, message: string, hint: string): void => { diagnostics.push({ code, ...span, column: span.startColumn, message, hint }); };
  const add = (type: string, params: Record<string, unknown>, span: SourceSpan, inputs: Record<string, string> = {}): string => {
    const id = `n${next++}`; nodes.push({ id, type, params }); sourceMap[id] = span;
    for (const [port, from] of Object.entries(inputs)) edges.push({ from, to: id, port }); return id;
  };
  const emit = (expr: Expr): string | undefined => {
    if (expr.kind === "number") return add("CONSTANT", { value: expr.value }, expr.span);
    if (expr.kind === "name") {
      const name = String(expr.value);
      if (assigned.has(name)) return assigned.get(name);
      if (["open", "high", "low", "close", "volume"].includes(name)) {
        let id = prices.get(name); if (!id) { id = add("PRICE", { field: name }, expr.span); prices.set(name, id); } return id;
      }
      const uppercase = /^[A-Z]/.test(name);
      issue(uppercase ? "AT-S003" : "AT-S004", expr.span, uppercase ? `Unknown name or function '${name}'.` : `Name '${name}' is used before it is assigned.`, uppercase ? "Keywords, price fields, and function names must be lowercase." : "Assign the name before using it."); return undefined;
    }
    if (expr.kind === "unary") {
      const operand = emit(expr.value); if (!operand) return undefined;
      if (expr.op === "not") return add("NOT", {}, expr.span, { input: operand });
      const zero = add("CONSTANT", { value: 0 }, expr.span); return add("SUB", {}, expr.span, { a: zero, b: operand });
    }
    if (expr.kind === "binary") {
      const left = emit(expr.left), right = emit(expr.right); if (!left || !right) return undefined;
      const op: Record<string, string> = { "+": "ADD", "-": "SUB", "*": "MUL", "/": "DIV", ">": "GT", "<": "LT", and: "AND", or: "OR" };
      return add(op[expr.op] ?? "", {}, expr.span, { a: left, b: right });
    }
    const op: Record<string, string> = { sma: "SMA", ema: "EMA", rsi: "RSI", delay: "DELAY", crosses_above: "CROSSES_ABOVE", crosses_below: "CROSSES_BELOW" };
    if (expr.args.length !== 2) { issue("AT-S006", expr.span, `${expr.name} expects 2 arguments.`, "Provide the input expression and its required second argument."); return undefined; }
    if (ranges[expr.name]) {
      const period = expr.args[1]; const range = ranges[expr.name]!;
      if (period?.kind !== "number" || !Number.isInteger(period.value) || Number(period.value) < range[0] || Number(period.value) > range[1]) {
        issue("AT-S006", period?.span ?? expr.span, `${expr.name} period must be an integer from ${range[0]} to ${range[1]}.`, "Use an integer literal in the range listed for this function."); return undefined;
      }
      const input = emit(expr.args[0]!); if (!input) return undefined;
      return add(op[expr.name]!, { [expr.name === "delay" ? "bars" : "period"]: period.value }, expr.span, { input });
    }
    const a = emit(expr.args[0]!), b = emit(expr.args[1]!); if (!a || !b) return undefined;
    return add(op[expr.name]!, {}, expr.span, { a, b });
  };
  for (const statement of statements) {
    if (statement.kind === "title") {
      if (!titleEligible || titleSeen) issue("AT-S005", statement.span, "The strategy title must be the first non-blank, non-comment line.", "Move the title to the first line containing a statement.");
      titleSeen = true; titleEligible = false; continue;
    }
    titleEligible = false;
    if (statement.kind === "assignment") {
      if (reserved.has(statement.name)) { issue("AT-S004", statement.span, `'${statement.name}' cannot be used as an assignment name.`, "Choose a name that is not a keyword, price field, or function name."); continue; }
      if (assigned.has(statement.name)) { issue("AT-S004", statement.span, `Name '${statement.name}' is assigned more than once.`, "Assign each name exactly once."); continue; }
      const id = emit(statement.expression); if (id) { assigned.set(statement.name, id); sourceMap[id] = statement.span; }
    } else if (statement.kind === "rule") {
      if (rules.has(statement.name)) issue("AT-S005", statement.span, `The ${statement.name} rule appears more than once.`, "Write exactly one buy rule and one sell rule.");
      else { const id = emit(statement.expression); if (id) rules.set(statement.name, id); }
    } else {
      if (settings.has(statement.name)) issue("AT-S005", statement.span, `The ${statement.name} setting appears more than once.`, "Use each setting at most once.");
      else settings.set(statement.name, statement);
    }
  }
  const last = statements.at(-1)?.span;
  const eofSpan = endSpan ?? (last ? { line: last.line, startColumn: last.endColumn, endColumn: last.endColumn } : { line: 1, startColumn: 1, endColumn: 1 });
  for (const name of ["buy", "sell"] as const) if (!rules.has(name)) issue("AT-S005", eofSpan, `The ${name} rule is missing.`, "Write exactly one buy rule and one sell rule.");
  if (diagnostics.length) return { sourceMap, diagnostics: diagnostics.sort((a, b) => a.line - b.line || a.startColumn - b.startColumn) };
  const config: Record<string, unknown> = { position_size_pct: settings.get("size")?.kind === "setting" ? settings.get("size")!.value : 100 };
  for (const key of ["stop_loss", "take_profit"] as const) { const value = settings.get(key); if (value) config[`${key}_pct`] = value.value; }
  const strategyId = add("STRATEGY", config, rules.get("buy") ? sourceMap[rules.get("buy")!]! : { line: 1, startColumn: 1, endColumn: 1 }, { entry: rules.get("buy")!, exit: rules.get("sell")! });
  return { graph: { nodes, edges }, sourceMap: { ...sourceMap, [strategyId]: statements.find((s) => s.kind === "rule" && s.name === "buy")?.span ?? sourceMap[strategyId]! }, diagnostics: [] };
}
