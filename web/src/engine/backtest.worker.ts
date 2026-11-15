/** Purpose: owns the initialized Rust/WASM engine and runs compiled strategies off the UI thread. Connects: transferred AGT1 bytes to transferable result arrays. */
import { TRADE_COLUMNS, WasmEngineClient, type WasmEngineExports } from "./wasmClient.js";
import { METRIC_NAMES, type PageToWorkerMessage, type WorkerToPageMessage } from "./backtestProtocol.js";

interface GeneratedWasmModule extends WasmEngineExports {
  default(): Promise<{ readonly memory: WebAssembly.Memory }>;
}
interface WorkerScope {
  onmessage: ((event: MessageEvent<PageToWorkerMessage>) => void) | null;
  postMessage(message: WorkerToPageMessage, transfer?: Transferable[]): void;
}

const workerScope = self as unknown as WorkerScope;
let client: WasmEngineClient | null = null;
let barTimestamps: Float64Array | null = null;

/** Handles one page request, including an optional startup run followed by the display run. @example `handleMessage(loadMessage)` writes the transferred AGT1 bytes once into WASM. */
async function handleMessage(message: PageToWorkerMessage): Promise<void> {
  try {
    const startupStartedAt = performance.now();
    if (message.type === "load-and-run") {
      if (client !== null) client.free();
      client = await createWasmClient();
      const prices = new Uint8Array(message.prices);
      barTimestamps = readTimestamps(prices);
      // The transferred API buffer is copied into WASM exactly once; subsequent runs reuse the WASM allocation.
      client.loadPrices(prices);
    }
    if (client === null || barTimestamps === null) throw new Error("Load price data before running a strategy.");
    let startupRunTimeMs: number | null = null;
    if (message.type === "load-and-run" && message.warmup) {
      client.runBacktest(message.astJson);
      client.freeBacktestResults();
      startupRunTimeMs = performance.now() - startupStartedAt;
      workerScope.postMessage({ type: "warmup-complete", runId: message.runId, startupRunTimeMs });
    }
    const runStartedAt = performance.now();
    const result = client.runBacktest(message.astJson);
    const runTimeMs = performance.now() - runStartedAt;
    const metrics = parseMetrics(result.metricsJson);
    const metricValues = new Float64Array(METRIC_NAMES.length);
    const metricDefined = new Uint8Array(METRIC_NAMES.length);
    METRIC_NAMES.forEach((name, index) => {
      const value = metrics[name];
      if (typeof value === "number" && Number.isFinite(value)) {
        metricValues[index] = value;
        metricDefined[index] = 1;
      }
      // Null metrics use a separate validity byte; NaN never becomes a UI result value.
    });
    const tradeColumns = TRADE_COLUMNS.map((name) => {
      const values = result.trades[name];
      return { name, buffer: copyFloat64(values), length: values.length };
    });
    const timestamps = copyFloat64(barTimestamps);
    const equity = copyFloat64(result.equity);
    const messageToSend: WorkerToPageMessage = {
      type: "result",
      runId: message.runId,
      timestamps,
      barCount: result.equity.length,
      equity,
      tradeColumns,
      metricValues: metricValues.buffer,
      metricDefined: metricDefined.buffer,
      metricNames: METRIC_NAMES,
      runTimeMs,
      startupRunTimeMs,
    };
    // Copy out before freeing WASM result memory; the transfer then moves these owned buffers to the page.
    client.freeBacktestResults();
    workerScope.postMessage(messageToSend, [
      timestamps, equity, ...tradeColumns.map((column) => column.buffer), metricValues.buffer, metricDefined.buffer,
    ]);
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      runId: message.runId,
      message: error instanceof Error ? error.message : "The engine worker encountered an unknown error.",
    });
  }
}

/** Initializes the built wasm-pack module inside this worker. @example `createWasmClient()` resolves after the binary has loaded. */
async function createWasmClient(): Promise<WasmEngineClient> {
  // Resolve relative to the worker script so Vite serves the generated package beside it in local development.
  const moduleUrl = new URL("./pkg/algotrace_engine.js", import.meta.url).href;
  const bindings = await import(/* @vite-ignore */ moduleUrl) as unknown as GeneratedWasmModule;
  const initialized = await bindings.default();
  return new WasmEngineClient({ ...bindings, memory: initialized.memory });
}

/** Reads AGT1's date column while the received input buffer is still attached. @example `readTimestamps(bytes)` returns one Unix-second value per bar. */
function readTimestamps(bytes: Uint8Array): Float64Array {
  if (bytes.byteLength < 16 || new TextDecoder().decode(bytes.subarray(0, 4)) !== "AGT1") throw new Error("The API returned an invalid AGT1 price file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  if (bytes.byteLength !== 16 + 6 * count * Float64Array.BYTES_PER_ELEMENT) throw new Error("The API returned a truncated AGT1 price file.");
  const timestamps = new Float64Array(count);
  for (let index = 0; index < count; index += 1) timestamps[index] = view.getFloat64(16 + index * 8, true);
  return timestamps;
}

/** Copies a WASM-backed numeric view into an independently transferable buffer. @example `copyFloat64(view)` returns an owned ArrayBuffer. */
function copyFloat64(values: Float64Array): ArrayBuffer {
  const copy = new Float64Array(values.length);
  copy.set(values);
  return copy.buffer;
}

/** Checks metric JSON is an object before mapping its named fields to transferable arrays. @example `parseMetrics('{"trade_count":2}')` returns a metric record. */
function parseMetrics(json: string): Record<string, number | null> {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("The WASM engine returned invalid metrics.");
  const record = parsed as Record<string, unknown>;
  const metrics: Record<string, number | null> = {};
  for (const [name, value] of Object.entries(record)) {
    if (value === null || (typeof value === "number" && Number.isFinite(value))) metrics[name] = value;
    else throw new Error(`The WASM engine returned an invalid value for metric ${name}.`);
  }
  return metrics;
}

workerScope.onmessage = (event) => { void handleMessage(event.data); };
