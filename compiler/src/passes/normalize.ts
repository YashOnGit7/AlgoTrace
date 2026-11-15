/** Purpose: builds per-port input maps and fills documented defaults. Connects: validated graph edges to later dependency passes. */
import { diagnostic } from "../diagnostics.js";
import type { Diagnostic, NormalizedGraph, NormalizedNode, StageResult, StrategyGraph } from "../model.js";
import costFile from "../../../engine/config/cost_presets.json";

/** Converts edge triples into node input maps and adds only defaults defined by the approved spec decisions. @example `normalizeGraph(graph)` gives an SMA node an `inputs.input` id. */
export function normalizeGraph(graph: StrategyGraph): StageResult<NormalizedGraph> {
  const byId = new Map<string, NormalizedNode>();
  for (const node of graph.nodes) {
    const params: Record<string, unknown> = { ...node.params };
    if (node.type === "STRATEGY" && params.position_size_pct === undefined) params.position_size_pct = 100;
    byId.set(node.id, { id: node.id, op: node.type, params, inputs: {} });
  }
  const errors: Diagnostic[] = [];
  for (const edge of graph.edges) {
    const target = byId.get(edge.to);
    if (target === undefined || byId.get(edge.from) === undefined) {
      errors.push(diagnostic("AT-E003", edge.to, edge.port));
      continue;
    }
    target.inputs[edge.port] = edge.from;
  }
  return { value: { nodes: [...byId.values()], byId, warnings: [] }, diagnostics: errors };
}

/** Applies documented defaults and validates config shape/ranges, reading cost rates from the shared engine JSON file. @example `normalizeConfig({})` supplies the spec defaults and delivery preset. */
export function normalizeConfig(input: unknown): StageResult<Record<string, unknown>> {
  const errors: Diagnostic[] = [];
  const settings = isRecord(input) ? input : {};
  if (!isRecord(input)) errors.push(diagnostic("AT-E007", null, "config", "Configuration must be an object."));
  const config: Record<string, unknown> = {
    initial_capital: defaultIfMissing(settings, "initial_capital", 100_000),
    slippage_pct: defaultIfMissing(settings, "slippage_pct", 0.05),
    force_close_at_end: defaultIfMissing(settings, "force_close_at_end", false),
    trading_days_per_year: defaultIfMissing(settings, "trading_days_per_year", 252),
    risk_free_rate: defaultIfMissing(settings, "risk_free_rate", 0.06),
  };
  const acceptedConfigKeys = ["initial_capital", "slippage_pct", "force_close_at_end", "trading_days_per_year", "risk_free_rate", "cost_preset"];
  for (const key of Object.keys(settings)) if (!acceptedConfigKeys.includes(key)) errors.push(diagnostic("AT-E007", null, key, `“${key}” is not a configuration field.`));
  const validNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  if (!validNumber(config.initial_capital) || config.initial_capital <= 0) errors.push(diagnostic("AT-E007", null, "initial_capital"));
  if (!validNumber(config.slippage_pct) || config.slippage_pct < 0 || config.slippage_pct >= 100) errors.push(diagnostic("AT-E007", null, "slippage_pct"));
  if (typeof config.force_close_at_end !== "boolean") errors.push(diagnostic("AT-E007", null, "force_close_at_end"));
  if (!Number.isInteger(config.trading_days_per_year) || Number(config.trading_days_per_year) < 1) errors.push(diagnostic("AT-E007", null, "trading_days_per_year"));
  if (!validNumber(config.risk_free_rate)) errors.push(diagnostic("AT-E007", null, "risk_free_rate"));
  let supplied: unknown = defaultIfMissing(settings, "cost_preset", "zerodha_equity_delivery");
  if (typeof supplied === "string") {
    const presets = (awaitlessPresets());
    if (!Object.hasOwn(presets, supplied)) {
      errors.push(diagnostic("AT-E007", null, "cost_preset", `The bundled preset name “${supplied}” is not available.`));
      return { value: config, diagnostics: errors };
    }
    supplied = presets[supplied];
  }
  if (typeof supplied !== "object" || supplied === null || Array.isArray(supplied)) {
    errors.push(diagnostic("AT-E007", null, "cost_preset"));
  } else {
    const rates = supplied as Record<string, unknown>;
    const expected = ["brokerage_pct", "brokerage_flat", "brokerage_max_per_order", "stt_buy_pct", "stt_sell_pct", "txn_pct", "sebi_pct", "stamp_buy_pct", "gst_pct", "dp_sell_flat"];
    for (const key of Object.keys(rates)) if (!expected.includes(key)) errors.push(diagnostic("AT-E007", null, `cost_preset.${key}`, `“${key}” is not a supported cost field.`));
    const preset: Record<string, number | null> = {};
    for (const key of expected) {
      const value = rates[key];
      if (key === "brokerage_max_per_order" && value === undefined) continue;
      if (key === "brokerage_max_per_order" && value === null) { preset[key] = null; continue; }
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push(diagnostic("AT-E007", null, `cost_preset.${key}`));
      } else preset[key] = value;
    }
    config.cost_preset = Object.fromEntries(Object.entries(preset).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  }
  return { value: config, diagnostics: errors };
}

/** Returns the engine-shared cost preset JSON, excluding its provenance metadata. @example `awaitlessPresets().zero_costs` reads the zero-fee object. */
function awaitlessPresets(): Record<string, Record<string, unknown>> {
  // The import is static so bundlers resolve the engine file as a single source of rates.
  return bundledCostPresets;
}

/** Checks for a non-array config or parameter object. @example `isRecord({})` is true. */
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

/** Uses a default only when the caller omitted a key, not when it supplied null. @example `defaultIfMissing({}, "x", 1)` returns `1`. */
function defaultIfMissing(record: Readonly<Record<string, unknown>>, key: string, fallback: unknown): unknown { return record[key] === undefined ? fallback : record[key]; }

const bundledCostPresets = Object.fromEntries(Object.entries(costFile).filter(([key, value]) => key !== "as_of" && key !== "source_url" && typeof value === "object")) as Record<string, Record<string, unknown>>;
