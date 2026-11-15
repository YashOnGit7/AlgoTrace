/** Purpose: stores the v1 node ports and output types used by structural and type passes. Connects: /spec/nodes.md and /spec/types.md to graph validation. */
export type ValueType = "Series" | "BoolSeries" | "Number";
export interface NodeDefinition { readonly inputs: Readonly<Record<string, readonly ValueType[]>>; readonly output: ValueType; readonly params: readonly string[] }
export const NODE_CATALOG: Readonly<Record<string, NodeDefinition>> = {
  PRICE: { inputs: {}, output: "Series", params: ["field"] },
  CONSTANT: { inputs: {}, output: "Number", params: ["value"] },
  SMA: { inputs: { input: ["Series"] }, output: "Series", params: ["period"] },
  EMA: { inputs: { input: ["Series"] }, output: "Series", params: ["period"] },
  RSI: { inputs: { input: ["Series"] }, output: "Series", params: ["period"] },
  ADD: { inputs: { a: ["Series", "Number"], b: ["Series", "Number"] }, output: "Series", params: [] },
  SUB: { inputs: { a: ["Series", "Number"], b: ["Series", "Number"] }, output: "Series", params: [] },
  MUL: { inputs: { a: ["Series", "Number"], b: ["Series", "Number"] }, output: "Series", params: [] },
  DIV: { inputs: { a: ["Series", "Number"], b: ["Series", "Number"] }, output: "Series", params: [] },
  DELAY: { inputs: { input: ["Series", "BoolSeries"] }, output: "Series", params: ["bars"] },
  GT: { inputs: { a: ["Series", "Number"], b: ["Series", "Number"] }, output: "BoolSeries", params: [] },
  LT: { inputs: { a: ["Series", "Number"], b: ["Series", "Number"] }, output: "BoolSeries", params: [] },
  CROSSES_ABOVE: { inputs: { a: ["Series", "Number"], b: ["Series", "Number"] }, output: "BoolSeries", params: [] },
  CROSSES_BELOW: { inputs: { a: ["Series", "Number"], b: ["Series", "Number"] }, output: "BoolSeries", params: [] },
  AND: { inputs: { a: ["BoolSeries"], b: ["BoolSeries"] }, output: "BoolSeries", params: [] },
  OR: { inputs: { a: ["BoolSeries"], b: ["BoolSeries"] }, output: "BoolSeries", params: [] },
  NOT: { inputs: { input: ["BoolSeries"] }, output: "BoolSeries", params: [] },
  STRATEGY: { inputs: { entry: ["BoolSeries"], exit: ["BoolSeries"] }, output: "BoolSeries", params: ["position_size_pct", "stop_loss_pct", "take_profit_pct"] },
};

/** Returns the supported input port names for a node operation. @example `requiredPorts("SMA")` returns `["input"]`. */
export function requiredPorts(op: string): readonly string[] { return Object.keys(NODE_CATALOG[op]?.inputs ?? {}); }
