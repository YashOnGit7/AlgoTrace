/** Purpose: exposes the one public graph-to-AST compiler function. Connects: AI graph JSON and caller config to the Rust engine AST. */
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { normalizeConfig, normalizeGraph } from "./passes/normalize.js";
import { validateInput } from "./passes/validate-input.js";
import { orderNodes } from "./passes/order.js";
import { checkTypes } from "./passes/type-check.js";
import { validateParams } from "./passes/validate-params.js";
import { pruneUnreachable } from "./passes/reachability.js";
import { mergeDuplicates } from "./passes/merge-duplicates.js";
import { foldConstants } from "./passes/constant-fold.js";
import { lowerToAst } from "./passes/lower.js";
import type { CompileResult, Diagnostic } from "./model.js";

export type { AstConfig, AstNode, CompileConfig, CompileFailure, CompileResult, CompileSuccess, Diagnostic, DiagnosticCode, GraphEdge, GraphNode, StrategyAst, StrategyGraph } from "./model.js";

/** Compiles the documented AI graph format and backtest config into the v1 Strategy AST. @example `compile(graph, {}).ok` is true for a valid graph with one STRATEGY node. */
export function compile(graph: unknown, config: unknown = {}): CompileResult {
  try {
    const input = validateInput(graph);
    if (input.diagnostics.length > 0 || input.value === undefined) return failure(input.diagnostics);
    const normalized = normalizeGraph(input.value);
    const normalizedConfig = normalizeConfig(config);
    const normalizationErrors = [...normalized.diagnostics, ...normalizedConfig.diagnostics];
    if (normalizationErrors.length > 0 || normalized.value === undefined || normalizedConfig.value === undefined) return failure(normalizationErrors);
    const ordering = orderNodes(normalized.value);
    if (ordering.diagnostics.length > 0 || ordering.value === undefined) return failure(ordering.diagnostics);
    const types = checkTypes(ordering.value);
    if (types.diagnostics.length > 0) return failure(types.diagnostics);
    const params = validateParams(ordering.value);
    if (params.diagnostics.length > 0) return failure(params.diagnostics);
    const reachable = pruneUnreachable(ordering.value);
    const merged = mergeDuplicates(reachable.value ?? []);
    const folded = foldConstants(merged.value ?? []);
    if (folded.diagnostics.length > 0 || folded.value === undefined) return failure(folded.diagnostics);
    const ast = lowerToAst(folded.value, normalizedConfig.value);
    return { ok: true, ast, warnings: sortDiagnostics(reachable.diagnostics, new Map()) };
  } catch (error) {
    // Untrusted model JSON should become a diagnostic, never an exception escaping the compiler boundary.
    const detail = error instanceof Error ? error.message : "The graph could not be read.";
    return failure([diagnostic("AT-E003", null, null, detail)]);
  }
}

/** Produces deterministic sorted failure diagnostics from one failing stage. @example `failure([oneError]).ok` is false. */
function failure(errors: readonly Diagnostic[]): CompileResult {
  const emptyStage = new Map<Diagnostic, number>();
  return { ok: false, errors: sortDiagnostics(errors, emptyStage) };
}

