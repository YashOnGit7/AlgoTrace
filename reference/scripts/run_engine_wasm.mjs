// Purpose: runs one Strategy AST through the real generated WASM engine.
// Connects: Python reference comparisons, frozen AGT1 bytes, and Rust backtest results.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/** Loads one AST and price file, then prints the engine result as JSON.
 * @example `node run_engine_wasm.mjs data/RELIANCE.agt1 '{"version":1,...}'`
 */
async function main() {
  const [pricePath, astJson] = process.argv.slice(2);
  if (pricePath === undefined || astJson === undefined) {
    throw new Error("usage: node run_engine_wasm.mjs <price-file> <ast-json>");
  }

  const generatedPath = resolve("web/src/engine/pkg/algotrace_engine.js");
  const wasmModule = await import(pathToFileURL(generatedPath).href);
  const wasmBinaryPath = resolve("web/src/engine/pkg/algotrace_engine_bg.wasm");
  const wasm = wasmModule.initSync({ module: readFileSync(wasmBinaryPath) });
  const input = readFileSync(pricePath);
  const inputPointer = wasmModule.reserve_price_buffer(input.byteLength);
  // Reserve can grow WASM memory, so create the view only after receiving its pointer.
  new Uint8Array(wasm.memory.buffer, inputPointer, input.byteLength).set(input);
  wasmModule.run_backtest(astJson);

  // Fetch all metadata before creating views because returned strings may allocate in WASM memory.
  const metricsJson = wasmModule.metrics_json();
  const equityPointer = wasmModule.equity_ptr();
  const equityLength = wasmModule.equity_len();
  const columnCount = wasmModule.trade_column_count();
  const columnNames = [
    "entry_bar", "exit_bar", "shares", "entry_price", "exit_price", "exit_reason_code",
    "entry_brokerage", "entry_stt", "entry_transaction", "entry_sebi", "entry_stamp_duty",
    "entry_gst", "entry_dp", "exit_brokerage", "exit_stt", "exit_transaction", "exit_sebi",
    "exit_stamp_duty", "exit_gst", "exit_dp", "net_profit",
  ];
  if (columnCount !== columnNames.length) {
    throw new Error(`WASM exposed ${columnCount} trade columns; expected ${columnNames.length}.`);
  }
  const columns = [];
  for (let column = 0; column < columnCount; column += 1) {
    columns.push({ pointer: wasmModule.trade_column_ptr(column), length: wasmModule.trade_column_len(column) });
  }

  // Recreate typed-array views after every potentially allocating WASM call.
  const currentBuffer = wasm.memory.buffer;
  const toJsonNumber = (value) => Number.isFinite(value) ? value : null;
  const equity = Array.from(new Float64Array(currentBuffer, equityPointer, equityLength), toJsonNumber);
  const trades = Object.fromEntries(columns.map(({ pointer, length }, index) => [
    columnNames[index], Array.from(new Float64Array(currentBuffer, pointer, length), toJsonNumber),
  ]));

  process.stdout.write(JSON.stringify({ equity, trades, metrics: JSON.parse(metricsJson) }));
  wasmModule.free_backtest_results();
  wasmModule.free_price_buffer();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

