/**
 * Purpose: gives the web app a typed and memory-safe facade over wasm-bindgen exports.
 * Connects: AGT1 bytes and Strategy AST JSON to the Rust engine's result and sweep APIs.
 */

/** Names the primitive engine exports produced by wasm-bindgen. */
export interface WasmEngineExports {
  readonly memory: WebAssembly.Memory;
  reserve_price_buffer(byteLength: number): number;
  free_price_buffer(): void;
  run_backtest(astJson: string): void;
  equity_ptr(): number;
  equity_len(): number;
  trade_column_count(): number;
  trade_column_ptr(column: number): number;
  trade_column_len(column: number): number;
  metrics_json(): string;
  free_backtest_results(): void;
  run_sweep_json(
    astJson: string,
    nodeId: string,
    parameterName: string,
    valuesJson: string,
  ): string;
}

/** Lists trade columns in the same order as the Rust `TRADE_COLUMN_NAMES` table. */
export const TRADE_COLUMNS = [
  "entry_bar",
  "exit_bar",
  "shares",
  "entry_price",
  "exit_price",
  "exit_reason_code",
  "entry_brokerage",
  "entry_stt",
  "entry_transaction",
  "entry_sebi",
  "entry_stamp_duty",
  "entry_gst",
  "entry_dp",
  "exit_brokerage",
  "exit_stt",
  "exit_transaction",
  "exit_sebi",
  "exit_stamp_duty",
  "exit_gst",
  "exit_dp",
  "net_profit",
] as const;

/** Gives the trade arrays stable human-readable names. */
export type TradeColumnName = (typeof TRADE_COLUMNS)[number];

/** Holds views that the caller must reacquire after the next WASM call that can grow memory. */
export interface BacktestViews {
  readonly equity: Float64Array;
  readonly trades: Readonly<Record<TradeColumnName, Float64Array>>;
  readonly metricsJson: string;
}

/** Represents one sweep value and its metrics as returned by the Rust engine. */
export interface SweepPoint {
  readonly value: number;
  readonly metrics: Readonly<Record<string, number | null>>;
}

/** Holds sweep summaries and freshly rebuilt backtest views after a sweep may grow memory. */
export interface SweepResponse {
  readonly points: readonly SweepPoint[];
  readonly results: BacktestViews;
}

/** Provides typed operations while avoiding stale views of a replaced WASM memory buffer. */
export class WasmEngineClient {
  private priceByteLength = 0;

  /**
   * Connects an initialized wasm-bindgen module to its TypeScript wrapper.
   * @example `const client = new WasmEngineClient(await initializeWasm());`
   */
  public constructor(private readonly wasm: WasmEngineExports) {}

  /**
   * Copies one encoded price file into a reserved WASM allocation.
   * @example `client.loadPrices(new Uint8Array(fileBytes));`
   */
  public loadPrices(priceBytes: Uint8Array): void {
    const pointer = this.wasm.reserve_price_buffer(priceBytes.byteLength);
    // reserve_price_buffer can grow linear memory, replacing memory.buffer; get the buffer only after it returns.
    const freshBytes = new Uint8Array(
      this.wasm.memory.buffer,
      pointer,
      priceBytes.byteLength,
    );
    // This is the sole browser-to-WASM copy. Rust reads these stored bytes in place on every run.
    freshBytes.set(priceBytes);
    this.priceByteLength = priceBytes.byteLength;
  }

  /**
   * Runs an AST against reserved AGT1 bytes and immediately returns fresh result views.
   * @example `const result = client.runBacktest(compiledAstJson);`
   */
  public runBacktest(astJson: string): BacktestViews {
    if (this.priceByteLength === 0) {
      throw new Error("Load a non-empty AGT1 price file before running a backtest.");
    }
    // The Rust call allocates result arrays and may grow WASM memory; no typed-array view is kept across it.
    this.wasm.run_backtest(astJson);
    return this.readBacktestViews();
  }

  /**
   * Reads fresh views for equity and every columnar trade field.
   * @example `const curve = client.readBacktestViews().equity;`
   */
  public readBacktestViews(): BacktestViews {
    // Fetch the JSON first because returning it across wasm-bindgen may allocate and grow memory.
    const metricsJson = this.wasm.metrics_json();
    const equityPointer = this.wasm.equity_ptr();
    const equityLength = this.wasm.equity_len();
    const tradeColumnCount = this.wasm.trade_column_count();
    if (tradeColumnCount !== TRADE_COLUMNS.length) {
      throw new Error(
        `The WASM module exposed ${tradeColumnCount} trade columns; expected ${TRADE_COLUMNS.length}.`,
      );
    }
    const locations: Array<{
      readonly name: TradeColumnName;
      readonly pointer: number;
      readonly length: number;
    }> = [];
    for (let column = 0; column < tradeColumnCount; column += 1) {
      const pointer = this.wasm.trade_column_ptr(column);
      const length = this.wasm.trade_column_len(column);
      const name = TRADE_COLUMNS[column];
      if (name === undefined) {
        throw new Error(`The WASM module exposed an unknown trade column ${column}.`);
      }
      locations.push({ name, pointer, length });
    }
    // All WASM calls are complete; capture the current buffer once and only now create the typed-array views.
    const currentBuffer = this.wasm.memory.buffer;
    const columns: Partial<Record<TradeColumnName, Float64Array>> = {};
    for (const location of locations) {
      columns[location.name] = new Float64Array(
        currentBuffer,
        location.pointer,
        location.length,
      );
    }
    return {
      equity: new Float64Array(currentBuffer, equityPointer, equityLength),
      trades: columns as Record<TradeColumnName, Float64Array>,
      metricsJson,
    };
  }

  /**
   * Runs a parameter sweep and validates the returned JSON shape.
   * @example `const response = client.runSweep(ast, "fast", "period", [5, 10]);`
   */
  public runSweep(
    astJson: string,
    nodeId: string,
    parameterName: string,
    values: readonly number[],
  ): SweepResponse {
    // Sweeps allocate workspaces and a JSON response, so the wrapper keeps no memory view across this call.
    const resultJson = this.wasm.run_sweep_json(
      astJson,
      nodeId,
      parameterName,
      JSON.stringify(values),
    );
    const parsed: unknown = JSON.parse(resultJson);
    if (!Array.isArray(parsed) || !parsed.every(isSweepPoint)) {
      throw new Error("The WASM engine returned an invalid sweep response.");
    }
    // Rebuild any existing result views after the sweep call before returning control to the UI.
    return { points: parsed, results: this.readBacktestViews() };
  }

  /**
   * Releases both input and output allocations owned by the engine.
   * @example `client.free();`
   */
  public free(): void {
    // These calls release engine allocations; dropping references here avoids exposing stale view objects internally.
    this.wasm.free_backtest_results();
    this.wasm.free_price_buffer();
    this.priceByteLength = 0;
  }
}

/**
 * Checks untrusted JSON before exposing it as a typed sweep result.
 * @example `isSweepPoint({ value: 5, metrics: { total_return: null } })` is true.
 */
function isSweepPoint(value: unknown): value is SweepPoint {
  if (typeof value !== "object" || value === null || !("value" in value) || !("metrics" in value)) {
    return false;
  }
  const point = value as { readonly value: unknown; readonly metrics: unknown };
  if (typeof point.value !== "number" || typeof point.metrics !== "object" || point.metrics === null) {
    return false;
  }
  return Object.values(point.metrics).every(
    (metric) => metric === null || typeof metric === "number",
  );
}
