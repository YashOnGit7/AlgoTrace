/**
 * Purpose: runs the native 20-bar worked example against the generated real WASM module.
 * Connects: wasm-pack output, the checked-in fixture, and the TypeScript memory wrapper.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { initSync } from "./pkg/algotrace_engine.js";
import * as wasmModule from "./pkg/algotrace_engine.js";

import { WasmEngineClient } from "./wasmClient.ts";
import { crossoverStrategyJson, encodeCrossoverFixture } from "./workedExample.ts";

/** Initializes generated wasm-bindgen code from the actual `.wasm` artifact on disk. */
function initializeBuiltWasm() {
  const wasmPath = fileURLToPath(new URL("./pkg/algotrace_engine_bg.wasm", import.meta.url));
  const initialized = initSync({ module: readFileSync(wasmPath) });
  // wasm-bindgen's public JS functions decode strings; its raw initialized exports do not.
  return { ...wasmModule, memory: initialized.memory };
}

it("matches native 20-bar crossover equity, trade count, and charges using real WASM", () => {
  const client = new WasmEngineClient(initializeBuiltWasm());
  client.loadPrices(encodeCrossoverFixture());
  const result = client.runBacktest(crossoverStrategyJson());
  const metrics = JSON.parse(result.metricsJson);

  expect(result.equity).toHaveLength(20);
  expect(result.equity[19]).toBe(1250);
  expect(result.trades.entry_bar).toHaveLength(1);
  expect(result.trades.exit_bar[0]).toBe(13);
  expect(metrics).toEqual(
    expect.objectContaining({
      trade_count: 1,
      total_charges: 0,
    }),
  );
  client.free();
});
