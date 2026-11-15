/** Purpose: runs the one-strategy AlgoTrace demonstration and presents its results. Connects: API data, compiler, worker messages, and equity chart. */
import { useEffect, useRef, useState } from "react";
import { compile } from "@algotrace/compiler";
import { EquityChart, type EquityPoint } from "./EquityChart.js";
import { METRIC_NAMES, type WorkerToPageMessage } from "./engine/backtestProtocol.js";
import { referenceSmaCrossoverGraph } from "./strategyGraph.js";
import type { TradeColumnName } from "./engine/wasmClient.js";
import "./app.css";

const SYMBOL = "RELIANCE.NS";
const API_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const API_START_COMMAND = "api\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000";
interface Summary { readonly finalEquity: number; readonly totalReturn: number; readonly closedTrades: number; readonly tradeRecords: number; readonly totalCharges: number }
interface CompletedRun { readonly points: readonly EquityPoint[]; readonly summary: Summary; readonly priceDownloadMs: number; readonly runTimeMs: number; readonly totalTimeMs: number; readonly barCount: number }
type RunStarter = (useIndianCharges: boolean, runWarmup: boolean) => void;

/** Displays loading, failure, and completed-run states for the reference crossover. @example opening the root Vite page starts a real RELIANCE.NS browser backtest. */
export function App(): React.JSX.Element {
  const [useIndianCharges, setUseIndianCharges] = useState(false);
  const [status, setStatus] = useState("Loading RELIANCE.NS prices and starting the WASM engine…");
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletedRun | null>(null);
  const [startupRunTimeMs, setStartupRunTimeMs] = useState<number | null>(null);
  const [apiBarCount, setApiBarCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const startRun = useRef<RunStarter | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./engine/backtest.worker.ts", import.meta.url), { type: "module", name: "algotrace-backtest" });
    let latestRunId = 0;
    const startedAt = new Map<number, number>();
    const downloadTimeMs = new Map<number, number>();
    let disposed = false;

    const run = async (withCharges: boolean, warmup: boolean): Promise<void> => {
      const runId = ++latestRunId;
      const totalStartedAt = performance.now();
      startedAt.set(runId, totalStartedAt);
      setIsLoading(true);
      setError(null);
      setStatus(withCharges ? "Re-running with Indian delivery charges…" : "Loading RELIANCE.NS prices and running the strategy…");
      try {
        const downloadStartedAt = performance.now();
        const response = await fetch(`${API_URL}/api/prices/${encodeURIComponent(SYMBOL)}`);
        if (response.status === 404) throw new Error(`${SYMBOL} was not found by the local API. Check that data\\RELIANCE.agt1 exists and restart the API.`);
        if (!response.ok) throw new Error(`The local price API returned HTTP ${response.status}.`);
        const header = response.headers.get("X-Bar-Count");
        const count = header === null ? Number.NaN : Number(header);
        if (!Number.isInteger(count) || count < 1) throw new Error("The browser could not read the API bar-count header. Confirm the API CORS settings allow this web address.");
        const priceBytes = await response.arrayBuffer();
        downloadTimeMs.set(runId, performance.now() - downloadStartedAt);
        const compilation = compile(referenceSmaCrossoverGraph(), {
          initial_capital: 100_000,
          slippage_pct: 0,
          force_close_at_end: false,
          trading_days_per_year: 252,
          risk_free_rate: 0.06,
          cost_preset: withCharges ? "zerodha_equity_delivery" : "zero_costs",
        });
        if (!compilation.ok) {
          const detail = compilation.errors.map((item) => `${item.code}: ${item.message}`).join("\n");
          throw new Error(`The strategy graph could not be compiled:\n${detail}`);
        }
        setApiBarCount(count);
        worker.postMessage({ type: "load-and-run", runId, prices: priceBytes, astJson: `${JSON.stringify(compilation.ast, null, 2)}\n`, warmup }, [priceBytes]);
      } catch (caught) {
        if (disposed || runId !== latestRunId) return;
        const message = caught instanceof TypeError
          ? `The local API is not running. Start it from the repository root with:\n${API_START_COMMAND}`
          : caught instanceof Error ? caught.message : "The backtest could not be completed.";
        setError(message);
        setStatus("Backtest could not start");
        setIsLoading(false);
      }
    };

    worker.onmessage = (event: MessageEvent<WorkerToPageMessage>) => {
      const message = event.data;
      if (disposed || message.runId !== latestRunId) return;
      if (message.type === "warmup-complete") { setStartupRunTimeMs(message.startupRunTimeMs); return; }
      if (message.type === "error") {
        setError(`The backtest worker could not finish:\n${message.message}`);
        setStatus("Backtest failed");
        setIsLoading(false);
        return;
      }
      const values = new Float64Array(message.metricValues);
      const defined = new Uint8Array(message.metricDefined);
      const metric = (name: (typeof METRIC_NAMES)[number]): number | null => {
        const index = METRIC_NAMES.indexOf(name);
        return defined[index] === 1 ? values[index] ?? null : null;
      };
      const trades: Partial<Record<TradeColumnName, Float64Array>> = {};
      for (const column of message.tradeColumns) trades[column.name] = new Float64Array(column.buffer);
      const entryBars = trades.entry_bar;
      const exitBars = trades.exit_bar;
      const tradeRecords = entryBars?.length ?? 0;
      const closedTrades = exitBars === undefined ? 0 : Array.from(exitBars).filter(Number.isFinite).length;
      const equity = new Float64Array(message.equity);
      const timestamps = new Float64Array(message.timestamps);
      const points = Array.from(equity, (value, index) => ({ timestamp: timestamps[index] ?? 0, equity: value }));
      const elapsed = performance.now() - (startedAt.get(message.runId) ?? performance.now());
      setCompleted({
        points,
        summary: {
          finalEquity: equity[equity.length - 1] ?? 0,
          totalReturn: metric("total_return") ?? 0,
          closedTrades: metric("trade_count") ?? closedTrades,
          tradeRecords,
          totalCharges: metric("total_charges") ?? 0,
        },
        runTimeMs: message.runTimeMs,
        priceDownloadMs: downloadTimeMs.get(message.runId) ?? 0,
        totalTimeMs: elapsed,
        barCount: message.barCount,
      });
      if (message.startupRunTimeMs !== null) setStartupRunTimeMs(message.startupRunTimeMs);
      setStatus(`${SYMBOL} backtest complete`);
      setError(null);
      setIsLoading(false);
    };
    worker.onerror = (event) => {
      if (disposed) return;
      setError(`The backtest worker stopped unexpectedly: ${event.message || "unknown worker error"}`);
      setStatus("Backtest failed");
      setIsLoading(false);
    };
    startRun.current = (withCharges, warmup) => { void run(withCharges, warmup); };
    void run(false, true);
    return () => {
      disposed = true;
      startRun.current = null;
      worker.terminate();
    };
  }, []);

  const onChargesChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const checked = event.currentTarget.checked;
    setUseIndianCharges(checked);
    startRun.current?.(checked, false);
  };

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="eyebrow">AlgoTrace · browser backtest</p>
        <h1>SMA crossover</h1>
        <p className="subtitle">SMA(10) crossing SMA(30) · {SYMBOL} · full frozen daily history</p>
      </header>
      <section className="control-row" aria-label="Backtest settings">
        <label className="charge-toggle">
          <input data-testid="charges-toggle" type="checkbox" checked={useIndianCharges} disabled={isLoading} onChange={onChargesChange} />
          <span>Indian charges (Zerodha delivery)</span>
        </label>
        <span className="preset-label">{useIndianCharges ? "zerodha_equity_delivery" : "zero_costs"}</span>
      </section>
      <p className={`status ${error ? "status-error" : completed ? "status-success" : ""}`} role="status" aria-live="polite" data-testid="run-status">{status}</p>
      {error !== null && <pre className="error-message" data-testid="run-error">{error}</pre>}
      {completed !== null && error === null && (
        <>
          <section className="metric-grid" aria-label="Backtest results">
            <Metric label="Final equity" testId="final-equity" value={formatRupees(completed.summary.finalEquity)} rawValue={completed.summary.finalEquity} />
            <Metric label="Total return" testId="total-return" value={`${(completed.summary.totalReturn * 100).toFixed(2)}%`} rawValue={completed.summary.totalReturn} />
            <Metric label="Closed trades" testId="closed-trades" value={String(completed.summary.closedTrades)} rawValue={completed.summary.closedTrades} />
            <Metric label="Total charges" testId="total-charges" value={formatRupees(completed.summary.totalCharges)} rawValue={completed.summary.totalCharges} />
          </section>
          <section className="timing-row" aria-label="Run timing">
            <p>API price download (request + bytes): <strong data-testid="price-download-time">{completed.priceDownloadMs.toFixed(2)} ms</strong></p>
            <p>Initial WASM setup + data upload + warm-up run (page load): <strong data-testid="startup-time">{startupRunTimeMs === null ? "—" : `${startupRunTimeMs.toFixed(2)} ms`}</strong></p>
            <p>Backtest engine time (latest run): <strong data-testid="wasm-time">{completed.runTimeMs.toFixed(2)} ms</strong></p>
            <p>End-to-end elapsed (latest API request to processed result): <strong data-testid="total-time">{completed.totalTimeMs.toFixed(2)} ms</strong></p>
          </section>
          <p className="trade-note" data-testid="trade-record-count">{completed.summary.tradeRecords} trade records including open positions; {completed.summary.closedTrades} closed trades are counted in metrics.</p>
          <section className="chart-card">
            <div className="chart-heading"><div><h2>Equity curve</h2><p>{completed.barCount.toLocaleString("en-IN")} daily bars</p></div><span>Rupees</span></div>
            <EquityChart points={completed.points} />
          </section>
        </>
      )}
      {completed === null && error === null && <div className="loading-panel" data-testid="loading-state"><span className="spinner" aria-hidden="true" /> Preparing the backtest in a background worker…</div>}
      <span className="visually-hidden" data-testid="api-bar-count">{apiBarCount ?? ""}</span>
    </main>
  );
}

interface MetricProps { readonly label: string; readonly testId: string; readonly value: string; readonly rawValue: number }
/** Displays one named summary metric with a machine-readable numeric value for accurate UI checks. @example `<Metric label="Final equity" value="₹2,91,218.03" />` formats the measured value. */
function Metric({ label, testId, value, rawValue }: MetricProps): React.JSX.Element {
  return <article className="metric-card"><p>{label}</p><strong data-testid={testId} data-value={rawValue}>{value}</strong></article>;
}

/** Formats rupees with Indian digit grouping and two decimal places. @example `formatRupees(1234567.89)` returns `₹12,34,567.89`. */
function formatRupees(value: number): string { return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
