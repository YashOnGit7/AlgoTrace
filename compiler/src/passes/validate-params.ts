/** Purpose: checks node params against v1 ranges and required values. Connects: graph normalization to valid engine operations. */
import { NODE_CATALOG } from "../catalog.js";
import { diagnostic } from "../diagnostics.js";
import type { Diagnostic, NormalizedNode, StageResult } from "../model.js";

/** Validates required and optional node parameters without inventing parameter defaults. @example `validateParams(nodes)` accepts an omitted optional stop loss. */
export function validateParams(nodes: readonly NormalizedNode[]): StageResult<true> {
  const errors: Diagnostic[] = [];
  for (const node of nodes) {
    const allowed = NODE_CATALOG[node.op]?.params ?? [];
    for (const key of Object.keys(node.params)) if (!allowed.includes(key)) errors.push(diagnostic("AT-E007", node.id, key, `“${key}” is not a parameter for ${node.op}.`));
    for (const key of allowed) {
      const value = node.params[key];
      const optional = node.op === "STRATEGY" && (key === "stop_loss_pct" || key === "take_profit_pct");
      if (value === undefined && optional) continue;
      if (value === undefined) { errors.push(diagnostic("AT-E007", node.id, key, `“${key}” is required.`)); continue; }
      if (typeof value !== "number" && !(node.op === "PRICE" && key === "field" && typeof value === "string")) {
        errors.push(diagnostic("AT-E007", node.id, key)); continue;
      }
      if (node.op === "PRICE" && key === "field" && !["open", "high", "low", "close", "volume"].includes(String(value))) errors.push(diagnostic("AT-E007", node.id, key));
      if (node.op === "CONSTANT" && key === "value" && (typeof value !== "number" || !Number.isFinite(value))) errors.push(diagnostic("AT-E007", node.id, key));
      if (["SMA", "EMA"].includes(node.op) && key === "period" && (!Number.isInteger(value) || Number(value) < 2 || Number(value) > 500)) errors.push(diagnostic("AT-E007", node.id, key));
      if (node.op === "RSI" && key === "period" && (!Number.isInteger(value) || Number(value) < 2 || Number(value) > 200)) errors.push(diagnostic("AT-E007", node.id, key));
      if (node.op === "DELAY" && key === "bars" && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 50)) errors.push(diagnostic("AT-E007", node.id, key));
      if (node.op === "STRATEGY" && key === "position_size_pct" && (!Number.isFinite(value) || Number(value) < 1 || Number(value) > 100)) errors.push(diagnostic("AT-E007", node.id, key));
      if (node.op === "STRATEGY" && key === "stop_loss_pct" && (!Number.isFinite(value) || Number(value) < 0.1 || Number(value) > 50)) errors.push(diagnostic("AT-E007", node.id, key));
      if (node.op === "STRATEGY" && key === "take_profit_pct" && (!Number.isFinite(value) || Number(value) < 0.1 || Number(value) > 500)) errors.push(diagnostic("AT-E007", node.id, key));
    }
  }
  return { value: true, diagnostics: errors };
}
