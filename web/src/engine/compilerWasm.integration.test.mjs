/** Purpose: runs spec example graphs compiled by TypeScript in the real Rust/WASM engine. Connects: graph examples, compiler output, frozen stocks, and trade-count yardsticks. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { compile } from "@algotrace/compiler";
import { initSync } from "./pkg/algotrace_engine.js";
import * as wasmModule from "./pkg/algotrace_engine.js";
import { WasmEngineClient } from "./wasmClient.ts";

const exampleDirectory = new URL("../../../spec/examples/", import.meta.url);
const dataDirectory = new URL("../../../data/", import.meta.url);
const strategies = [
  ["sma_crossover", 79, 77],
  ["rsi_oversold_overbought", 17, 16],
  ["price_above_sma_stop", 236, 229],
];
const symbols = ["RELIANCE", "TCS"];
const matchingVectorbtConfig = {
  initial_capital: 100_000,
  slippage_pct: 0,
  cost_preset: "zero_costs",
  force_close_at_end: false,
  risk_free_rate: 0.06,
  trading_days_per_year: 252,
};

/** Initializes the generated wasm-bindgen code from its actual binary file. @example `initEngine()` returns live memory and exported engine methods. */
function initEngine() {
  const wasmPath = fileURLToPath(new URL("./pkg/algotrace_engine_bg.wasm", import.meta.url));
  const initialized = initSync({ module: readFileSync(wasmPath) });
  return { ...wasmModule, memory: initialized.memory };
}

/** Loads one graph example and compiles it with exact vectorbt reference settings. @example `compileExample("sma_crossover")` returns the compiler AST. */
function compileExample(name) {
  const graph = JSON.parse(readFileSync(fileURLToPath(new URL(`${name}.json`, exampleDirectory)), "utf8"));
  const result = compile(graph, matchingVectorbtConfig);
  if (!result.ok) throw new Error(`${name} did not compile: ${JSON.stringify(result.errors)}`);
  return result.ast;
}

/** Runs the actual WASM artifact on a frozen AGT1 stock and returns the closed-plus-open trade list size. @example `tradeCount("RELIANCE", ast)` returns its engine trade count. */
function tradeCount(symbol, ast) {
  const bytes = readFileSync(fileURLToPath(new URL(`${symbol}.agt1`, dataDirectory)));
  const client = new WasmEngineClient(initEngine());
  client.loadPrices(new Uint8Array(bytes));
  const result = client.runBacktest(`${JSON.stringify(ast, null, 2)}\n`);
  const count = result.trades.entry_bar.length;
  client.free();
  return count;
}

it.each(strategies)("compiles and runs %s on RELIANCE.NS and TCS.NS in real WASM", (name, relianceCount, tcsCount) => {
  const ast = compileExample(name);
  expect(tradeCount("RELIANCE", ast)).toBe(relianceCount);
  expect(tradeCount("TCS", ast)).toBe(tcsCount);
});
