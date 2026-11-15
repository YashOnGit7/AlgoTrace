/** Purpose: defines the typed messages crossing the page/worker boundary. Connects: React UI to the worker-owned WASM engine. */
import type { TradeColumnName } from "./wasmClient.js";

export const METRIC_NAMES = [
  "total_return", "cagr", "sharpe", "sortino", "max_drawdown", "max_drawdown_length",
  "trade_count", "win_rate", "profit_factor", "average_net_trade", "exposure", "total_charges", "buy_and_hold_return",
] as const;

/** Names metrics in the same stable column order used for transferred metric values. @example `METRIC_NAMES[0]` is `total_return`. */
export type MetricName = (typeof METRIC_NAMES)[number];
/** Carries one API price file directly to the worker for its single WASM-memory write. @example `{type:"load-and-run", prices, astJson}` starts a fresh page run. */
export interface LoadAndRunMessage { readonly type: "load-and-run"; readonly runId: number; readonly prices: ArrayBuffer; readonly astJson: string; readonly warmup: boolean }
/** Reruns the stored price bytes with a newly compiled cost configuration. @example `{type:"rerun", runId, astJson}` applies the checkbox selection. */
export interface RerunMessage { readonly type: "rerun"; readonly runId: number; readonly astJson: string }
export type PageToWorkerMessage = LoadAndRunMessage | RerunMessage;

/** Holds a result column whose owned buffer can be transferred without cloning again. @example `{name:"entry_bar", buffer}` is one trade column. */
export interface TransferableTradeColumn { readonly name: TradeColumnName; readonly buffer: ArrayBuffer; readonly length: number }
/** Returns all result arrays in standalone buffers so the page can take ownership. @example `type === "result"` means equity and metrics are ready for display. */
export interface WorkerResultMessage {
  readonly type: "result";
  readonly runId: number;
  readonly timestamps: ArrayBuffer;
  readonly barCount: number;
  readonly equity: ArrayBuffer;
  readonly tradeColumns: readonly TransferableTradeColumn[];
  readonly metricValues: ArrayBuffer;
  readonly metricDefined: ArrayBuffer;
  readonly metricNames: typeof METRIC_NAMES;
  readonly runTimeMs: number;
  readonly startupRunTimeMs: number | null;
}
/** Reports the first engine run timing before its displayable second run. @example `type === "warmup-complete"` updates the cold-start timing. */
export interface WarmupCompleteMessage { readonly type: "warmup-complete"; readonly runId: number; readonly startupRunTimeMs: number }
/** Reports a worker-side failure as plain text for a friendly page message. @example `type === "error"` may describe WASM loading or execution. */
export interface WorkerErrorMessage { readonly type: "error"; readonly runId: number; readonly message: string }
export type WorkerToPageMessage = WorkerResultMessage | WarmupCompleteMessage | WorkerErrorMessage;
