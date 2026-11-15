/** Purpose: checks the value type arriving at every required node port. Connects: the node catalog's type rules to the valid graph. */
import { NODE_CATALOG } from "../catalog.js";
import { diagnostic } from "../diagnostics.js";
import type { Diagnostic, NormalizedNode, StageResult } from "../model.js";
import type { ValueType } from "../catalog.js";

/** Validates all required connections and prevents Number-to-BoolSeries or Series-to-BoolSeries mismatches. @example `checkTypes(nodes)` accepts a Number plugged into one side of a Series comparison. */
export function checkTypes(nodes: readonly NormalizedNode[]): StageResult<Map<string, ValueType>> {
  const errors: Diagnostic[] = [];
  const types = new Map<string, ValueType>();
  for (const node of nodes) {
    const definition = NODE_CATALOG[node.op];
    if (definition === undefined) continue;
    for (const port of Object.keys(definition.inputs)) {
      if (node.inputs[port] === undefined) errors.push(diagnostic("AT-E006", node.id, port));
    }
    const inputTypes: Record<string, ValueType | undefined> = {};
    for (const [port, sourceId] of Object.entries(node.inputs)) {
      const sourceType = types.get(sourceId);
      inputTypes[port] = sourceType;
      const accepted = definition.inputs[port];
      if (sourceType === undefined) errors.push(diagnostic("AT-E005", node.id, port, "The connected node does not produce a value series."));
      else if (accepted !== undefined && !accepted.includes(sourceType)) errors.push(diagnostic("AT-E005", node.id, port, `${sourceType} cannot plug into this input.`));
    }
    if (["ADD", "SUB", "MUL", "DIV", "GT", "LT", "CROSSES_ABOVE", "CROSSES_BELOW"].includes(node.op)
      && inputTypes.a === "Number" && inputTypes.b === "Number") errors.push(diagnostic("AT-E010", node.id));
    if (node.op === "DELAY") {
      const inputType = inputTypes.input;
      types.set(node.id, inputType === "BoolSeries" ? "BoolSeries" : "Series");
    } else if (definition.output !== "BoolSeries" || node.op !== "STRATEGY") types.set(node.id, definition.output);
  }
  return { value: types, diagnostics: errors };
}
