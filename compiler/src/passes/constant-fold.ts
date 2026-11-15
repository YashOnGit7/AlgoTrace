/** Purpose: provides the optimizer pass boundary for safe compile-time evaluation. Connects: canonical graph nodes to AST lowering. */
import type { NormalizedNode, StageResult } from "../model.js";

/** Applies safe v1 constant folds; current graph rules reject constant-only math, leaving no foldable operation. @example `foldConstants(nodes)` preserves valid supported graph computations. */
export function foldConstants(nodes: readonly NormalizedNode[]): StageResult<NormalizedNode[]> {
  // /spec/nodes.md rejects math/comparison with two Number inputs (AT-E010), while other v1 operators consume series.
  return { value: [...nodes], diagnostics: [] };
}
