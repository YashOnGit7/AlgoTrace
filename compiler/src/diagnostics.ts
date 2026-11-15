/** Purpose: creates friendly, deterministic compiler diagnostics. Connects: every compiler pass to /spec/errors.md. */
import type { Diagnostic, DiagnosticCode } from "./model.js";

const explanations: Record<Exclude<DiagnosticCode, "AT-W001">, { message: string; hint: string }> = {
  "AT-E001": { message: "Two nodes use the same id.", hint: "Give every node a different id so connections have one clear destination." },
  "AT-E002": { message: "This node type is not supported.", hint: "Choose a node type listed in /spec/nodes.md." },
  "AT-E003": { message: "A connection points to a missing node or an unknown input port.", hint: "Check both node ids and the destination port name." },
  "AT-E004": { message: "These nodes depend on one another in a cycle.", hint: "Remove one connection so every dependency eventually leads to an input." },
  "AT-E005": { message: "A connected value has the wrong type for this input.", hint: "Connect values with the type shown for that input in the node catalog." },
  "AT-E006": { message: "A required input is not connected.", hint: "Connect a value to every required input port." },
  "AT-E007": { message: "A parameter or configuration value is missing, invalid, or out of range.", hint: "Enter a finite value of the expected type and within the range shown in the node catalog." },
  "AT-E008": { message: "The graph has no strategy output.", hint: "Add one STRATEGY node and connect its entry and exit signals." },
  "AT-E009": { message: "The graph has more than one strategy output.", hint: "Keep exactly one STRATEGY node in the graph." },
  "AT-E010": { message: "This math or comparison uses two constants and has no price series.", hint: "Connect at least one Series value; constants are broadcast alongside a Series." },
};

/** Builds a spec-coded diagnostic with a plain explanation and a next step. @example `diagnostic("AT-E008")` explains how to add the strategy output. */
export function diagnostic(code: DiagnosticCode, nodeId: string | null = null, port: string | null = null, detail?: string): Diagnostic {
  if (code === "AT-W001") return { code, message: detail ?? "An unused node was removed.", nodeId, port, hint: "Connect this node to the strategy entry or exit signal if you want it included." };
  const explanation = explanations[code];
  return { code, message: detail ? `${explanation.message} ${detail}` : explanation.message, nodeId, port, hint: explanation.hint };
}

/** Sorts diagnostics in the fixed stage/code/node order chosen for reproducible results. @example `sortDiagnostics(list)` returns the same order on every run. */
export function sortDiagnostics<T extends Diagnostic>(items: readonly T[], stageOrder: ReadonlyMap<Diagnostic, number>): T[] {
  return [...items].sort((left, right) => (stageOrder.get(left) ?? 0) - (stageOrder.get(right) ?? 0)
    || compare(left.code, right.code)
    || compare(left.nodeId ?? "", right.nodeId ?? "")
    || compare(left.port ?? "", right.port ?? ""));
}

/** Compares strings in plain JavaScript code-point order. @example `compare("A", "a")` returns a negative value. */
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
