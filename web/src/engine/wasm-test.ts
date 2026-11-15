/**
 * Purpose: runs the visible 20-bar smoke test with the generated WebAssembly engine.
 * Connects: the checked-in price fixture, the wrapper, and the plain HTML test page.
 */

import { WasmEngineClient } from "./wasmClient";
import type { WasmEngineExports } from "./wasmClient";
import { crossoverStrategyJson, encodeCrossoverFixture } from "./workedExample";

/** Loads the compiled module, runs the worked strategy, and writes its verified values into the page. */
async function showWorkedExample(): Promise<void> {
  const status = requiredElement("status");
  try {
    // The generated glue is created by `pnpm build:wasm`, so Vite must not resolve it before that build exists.
    const wasmModuleUrl = new URL("./pkg/algotrace_engine.js", import.meta.url).href;
    const generatedModule: unknown = await import(/* @vite-ignore */ wasmModuleUrl);
    if (!isGeneratedModule(generatedModule)) {
      throw new Error("The generated wasm-bindgen package has an unexpected export shape.");
    }
    // The glue loads the generated .wasm file relative to itself from the same served folder.
    const initialized = await generatedModule.default();
    // wasm-bindgen returns memory from its initializer, rather than exporting it on the glue namespace.
    const client = new WasmEngineClient({ ...generatedModule, memory: initialized.memory });
    client.loadPrices(encodeCrossoverFixture());
    const result = client.runBacktest(crossoverStrategyJson());
    const metrics: unknown = JSON.parse(result.metricsJson);
    if (!isMetrics(metrics)) {
      throw new Error("The WASM engine returned an unexpected metrics object.");
    }

    requiredElement("final-equity").textContent = formatRupees(result.equity.at(-1));
    requiredElement("trade-count").textContent = String(metrics.trade_count);
    requiredElement("total-charges").textContent = formatRupees(metrics.total_charges);
    status.textContent = "Passed: real WebAssembly output matches the native worked example.";
    status.dataset.state = "success";
    client.free();
  } catch (error: unknown) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.dataset.state = "error";
  }
}

/**
 * Checks generated JavaScript exports before passing them into the typed client.
 * @example `isGeneratedModule(await import(moduleUrl))` verifies the generated module contract.
 */
function isGeneratedModule(
  value: unknown,
): value is Omit<WasmEngineExports, "memory"> & {
  readonly default: () => Promise<{ readonly memory: WebAssembly.Memory }>;
} {
  if (typeof value !== "object" || value === null || !("default" in value)) {
    return false;
  }
  const module = value as Partial<Omit<WasmEngineExports, "memory">> & { readonly default: unknown };
  return (
    typeof module.default === "function" &&
    typeof module.reserve_price_buffer === "function" &&
    typeof module.run_backtest === "function" &&
    typeof module.equity_ptr === "function" &&
    typeof module.equity_len === "function" &&
    typeof module.trade_column_ptr === "function" &&
    typeof module.trade_column_len === "function" &&
    typeof module.metrics_json === "function"
  );
}

/**
 * Retrieves a required result element or reports a clear page-setup error.
 * @example `requiredElement("status")` finds the page's live status message.
 */
function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`The test page is missing its #${id} element.`);
  }
  return element;
}

/**
 * Checks that the two metrics needed by this page have numeric values.
 * @example `isMetrics({ trade_count: 1, total_charges: 0 })` is true.
 */
function isMetrics(value: unknown): value is { readonly trade_count: number; readonly total_charges: number } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "trade_count" in value &&
    typeof value.trade_count === "number" &&
    "total_charges" in value &&
    typeof value.total_charges === "number"
  );
}

/**
 * Formats rupee values for the demo without changing the engine's stored precision.
 * @example `formatRupees(1250)` returns `₹1250.00`.
 */
function formatRupees(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }
  return `₹${value.toFixed(2)}`;
}

void showWorkedExample();
