/** Purpose: provides the code-first strategy workspace and its backtest flow. Connects: source compiler, local price API, WASM worker, and graph/results views. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compileSource, type SourceCompileResult } from "@algotrace/compiler";
import { METRIC_NAMES, type WorkerToPageMessage } from "../engine/backtestProtocol.js";
import { EquityChart, type EquityPoint } from "../EquityChart.js";
import type { TradeColumnName } from "../engine/wasmClient.js";
import { locationForError, useStudioEditorStore } from "./store.js";
import { ReadOnlyGraph } from "./ReadOnlyGraph.js";
import { AssistantPanel } from "./AssistantPanel.js";
import "./studio.css";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const API_START_COMMAND = "api\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000";
const STRATEGY_SOURCES = import.meta.glob("../../../spec/examples/*.strategy", { eager: true, query: "?raw", import: "default" });
const EXAMPLES = [
  { id: "sma_crossover", label: "Moving-average crossover", file: "sma_crossover.strategy" },
  { id: "rsi_oversold_overbought", label: "RSI oversold / overbought", file: "rsi_oversold_overbought.strategy" },
  { id: "price_above_sma_stop", label: "Price above average with stop-loss", file: "price_above_sma_stop.strategy" },
] as const;
const BLANK_TEMPLATE = "# One statement per line; keywords are lowercase.\n# Assign names before using them.\n# Example: average = sma(close, 20)\n# buy when close > average\n# sell when close < average\n";
type StudioStatus = "ready" | "compiling" | "loading prices" | "running" | "done" | "failed";
type PanelTab = "graph" | "results";
interface CompletedRun { readonly points: readonly EquityPoint[]; readonly finalEquity: number; readonly totalReturn: number | null; readonly closedTrades: number | null; readonly charges: number | null; readonly engineTimeMs: number; readonly barCount: number }

/** Displays the beginner code-first workspace with compile, graph preview, and real-worker results. @example rendering `<StrategyStudio />` opens on a remembered source draft. */
export function StrategyStudio(): React.JSX.Element {
  const source = useStudioEditorStore((state) => state.source);
  const setSource = useStudioEditorStore((state) => state.setSource);
  const loadExample = useStudioEditorStore((state) => state.loadExample);
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [symbols, setSymbols] = useState<string[]>(["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "ITC.NS", "SBIN.NS", "LT.NS", "BHARTIARTL.NS", "HINDUNILVR.NS", "AXISBANK.NS", "KOTAKBANK.NS", "MARUTI.NS", "SUNPHARMA.NS", "ASIANPAINT.NS", "^NSEI"]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [capital, setCapital] = useState("100000");
  const [indianCharges, setIndianCharges] = useState(true);
  const [selectedExample, setSelectedExample] = useState("blank");
  const [compileResult, setCompileResult] = useState<SourceCompileResult | null>(null);
  const [status, setStatus] = useState<StudioStatus>("compiling");
  const [statusMessage, setStatusMessage] = useState("Checking your strategy…");
  const [runError, setRunError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompletedRun | null>(null);
  const [panel, setPanel] = useState<PanelTab>("graph");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const runId = useRef(0);
  const chargePreset = indianCharges ? "zerodha_equity_delivery" : "zero_costs";
  // The reference comparison uses zero slippage; this page exposes the cost toggle but no slippage control.
  const config = useMemo(() => ({ initial_capital: Number(capital), slippage_pct: 0, cost_preset: chargePreset }), [capital, chargePreset]);
  const lines = source.split("\n");

  useEffect(() => {
    const worker = new Worker(new URL("../engine/backtest.worker.ts", import.meta.url), { type: "module", name: "algotrace-studio-backtest" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerToPageMessage>) => receiveWorkerMessage(event.data);
    worker.onerror = () => { setStatus("failed"); setStatusMessage("The backtest stopped unexpectedly. Please try again."); setRunError("The background engine could not finish this run."); };
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch(`${API_URL}/api/symbols`).then(async (response) => {
      if (!response.ok) throw new Error("The symbol list is not available right now.");
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("symbols" in data) || !Array.isArray(data.symbols)) throw new Error("The local service returned an unreadable symbol list.");
      const available = data.symbols.filter((item): item is string => typeof item === "string");
      if (active && available.length > 0) { setSymbols(available); if (!available.includes(symbol)) setSymbol(available.includes("RELIANCE.NS") ? "RELIANCE.NS" : available[0] ?? "RELIANCE.NS"); }
    }).catch(() => { /* A temporary fallback list leaves the editor usable while the local API starts. */ });
    return () => { active = false; };
  }, [symbol]);

  useEffect(() => {
    setStatus("compiling");
    const timer = window.setTimeout(() => {
      const result = compileSource(source, config);
      setCompileResult(result);
      setStatus((current) => current === "compiling" ? (result.ok ? "ready" : "failed") : current);
      setStatusMessage(result.ok ? "Valid strategy" : `${result.errors.length} item${result.errors.length === 1 ? "" : "s"} to fix before running`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [source, config]);

  const runBacktest = useCallback(async (): Promise<void> => {
    setStatus("compiling"); setStatusMessage("Checking your strategy…"); setRunError(null);
    const result = compileSource(source, config);
    setCompileResult(result);
    if (!result.ok) { setStatus("failed"); setStatusMessage("Fix the marked lines before running."); setPanel("graph"); return; }
    const currentRun = ++runId.current;
    setStatus("loading prices"); setStatusMessage("Loading the selected price history…"); setCompleted(null);
    try {
      const query = new URLSearchParams();
      if (fromDate) query.set("from", fromDate);
      if (toDate) query.set("to", toDate);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const response = await fetch(`${API_URL}/api/prices/${encodeURIComponent(symbol)}${suffix}`);
      if (response.status === 404) throw new Error(`No frozen prices were found for ${symbol}. Choose another symbol from the list.`);
      if (response.status === 422) throw new Error("The start date must be on or before the end date.");
      if (!response.ok) throw new Error(`The local price service returned an error (${response.status}).`);
      const barCount = Number(response.headers.get("X-Bar-Count"));
      if (!Number.isInteger(barCount) || barCount < 1) throw new Error("No price bars were found for that date range. Try a wider range.");
      const prices = await response.arrayBuffer();
      setStatus("running"); setStatusMessage("Running the strategy in the background…");
      const astJson = `${JSON.stringify(result.ast, null, 2)}\n`;
      workerRef.current?.postMessage({ type: "load-and-run", runId: currentRun, prices, astJson, warmup: false }, [prices]);
    } catch (error) {
      setStatus("failed"); setStatusMessage("The backtest could not start.");
      setRunError(error instanceof TypeError ? `The local price service is not running. Start it from the repository root with:\n${API_START_COMMAND}` : error instanceof Error ? error.message : "Please check the settings and try again.");
    }
  }, [capital, chargePreset, config, fromDate, source, symbol, toDate]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent): void => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void runBacktest(); } };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [runBacktest]);

  function receiveWorkerMessage(message: WorkerToPageMessage): void {
    if (message.runId !== runId.current) return;
    if (message.type === "warmup-complete") return;
    if (message.type === "error") { setStatus("failed"); setStatusMessage("The engine could not finish this strategy."); setRunError(message.message); return; }
    const values = new Float64Array(message.metricValues);
    const defined = new Uint8Array(message.metricDefined);
    const metric = (name: (typeof METRIC_NAMES)[number]): number | null => { const index = METRIC_NAMES.indexOf(name); return defined[index] === 1 ? values[index] ?? null : null; };
    const equity = new Float64Array(message.equity);
    const timestamps = new Float64Array(message.timestamps);
    // Trade columns are transferred even though this first Studio view summarizes closed trades only.
    const trades: Partial<Record<TradeColumnName, Float64Array>> = {};
    for (const column of message.tradeColumns) trades[column.name] = new Float64Array(column.buffer);
    const closedTrades = metric("trade_count") ?? (trades.exit_bar ? Array.from(trades.exit_bar).filter(Number.isFinite).length : null);
    setCompleted({ points: Array.from(equity, (value, index) => ({ timestamp: timestamps[index] ?? 0, equity: value })), finalEquity: equity.at(-1) ?? Number(config.initial_capital), totalReturn: metric("total_return"), closedTrades, charges: metric("total_charges"), engineTimeMs: message.runTimeMs, barCount: message.barCount });
    setStatus("done"); setStatusMessage("Backtest complete"); setPanel("results");
  }

  function showErrorLine(error: { readonly line?: number; readonly column?: number; readonly startColumn?: number }): void {
    const location = locationForError(error);
    if (!location || !textarea.current) return;
    const start = lines.slice(0, location.line - 1).reduce((length, line) => length + line.length + 1, 0) + location.column - 1;
    textarea.current.focus(); textarea.current.setSelectionRange(start, start); textarea.current.scrollTop = (location.line - 1) * 24;
  }

  async function openSourceFile(file: File | undefined): Promise<void> {
    if (!file) return;
    const text = await file.text(); setSource(text); setSelectedExample("custom");
    if (fileInput.current) fileInput.current.value = "";
  }

  function saveSourceFile(): void {
    const file = new Blob([source], { type: "text/plain;charset=utf-8" });
    const address = URL.createObjectURL(file); const anchor = document.createElement("a"); anchor.href = address; anchor.download = "my-strategy.strategy"; anchor.click(); URL.revokeObjectURL(address);
  }

  const errors = compileResult && !compileResult.ok ? compileResult.errors : [];
  const compilerDiagnostics = errors.filter((item): item is import("@algotrace/compiler").Diagnostic & { readonly nodeId: string } =>
    "nodeId" in item && typeof item.nodeId === "string" && "port" in item && (item.port === null || typeof item.port === "string"));
  const graph = compileResult?.graph ?? { nodes: [], edges: [] };
  const sourceMap = compileResult?.sourceMap ?? {};

  return <main className="studio-shell">
    <header className="studio-heading"><div><p className="studio-eyebrow">ALGOTRACE · CODE FIRST</p><h1>Strategy Studio</h1><p>Write a rule in everyday-sized steps, check it, then run it on frozen daily prices.</p></div><span className={`studio-status status-${status}`} role="status" aria-live="polite" data-testid="studio-status">{statusMessage}</span></header>
    <section className="studio-toolbar" aria-label="Backtest settings">
      <label>Stock<select aria-label="Stock" value={symbol} onChange={(event) => setSymbol(event.currentTarget.value)}>{symbols.map((item) => <option value={item} key={item}>{item === "^NSEI" ? "NIFTY 50 (^NSEI)" : item}</option>)}</select></label>
      <label>From<input aria-label="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.currentTarget.value)} /></label>
      <label>To<input aria-label="To date" type="date" value={toDate} onChange={(event) => setToDate(event.currentTarget.value)} /></label>
      <label>Starting capital<input aria-label="Starting capital" type="number" min="1" step="1" value={capital} onChange={(event) => setCapital(event.currentTarget.value)} /></label>
      <label className="studio-charge-toggle"><input type="checkbox" checked={indianCharges} onChange={(event) => setIndianCharges(event.currentTarget.checked)} /><span>Indian charges (Zerodha delivery)</span></label>
      <label>Examples<select aria-label="Examples" value={selectedExample} onChange={(event) => { const choice = event.currentTarget.value; setSelectedExample(choice); if (choice === "blank") loadExample("blank", BLANK_TEMPLATE); else { const example = EXAMPLES.find((item) => item.id === choice); if (example) loadExample(example.label, readExample(example.file) ?? BLANK_TEMPLATE); } }}>
        <option value="blank">Blank template</option>{EXAMPLES.map((example) => <option value={example.id} key={example.id}>{example.label}</option>)}
      </select></label>
      <button type="button" className="studio-run-button" onClick={() => void runBacktest()} data-testid="studio-run">Run backtest <kbd>Ctrl+Enter</kbd></button>
    </section>
    <section className="studio-workspace">
      <div className="studio-editor-column">
        <AssistantPanel source={source} config={config} endpoint={`${API_URL}/api/generate`} />
        <div className="studio-editor-heading"><div><h2>Strategy code</h2><span>Saved in this browser as you type</span></div><div className="studio-file-actions"><button type="button" onClick={() => fileInput.current?.click()}>Open file</button><button type="button" onClick={saveSourceFile}>Save file</button><input ref={fileInput} type="file" accept=".strategy,.txt,text/plain" hidden onChange={(event) => void openSourceFile(event.currentTarget.files?.[0])} /></div></div>
        <div className="studio-editor" data-testid="studio-editor"><div className="studio-gutter" aria-hidden="true">{lines.map((_, index) => <span className={errors.some((item) => item.line === index + 1) ? "has-line-error" : ""} key={index}>{String(index + 1).padStart(2, "0")}</span>)}</div>
          <textarea ref={textarea} aria-label="Strategy code" spellCheck={false} value={source} onChange={(event) => setSource(event.currentTarget.value)} onScroll={(event) => { const gutter = event.currentTarget.previousElementSibling; if (gutter instanceof HTMLElement) gutter.scrollTop = event.currentTarget.scrollTop; }} />
        </div>
        <div className={`studio-compile-feedback ${compileResult?.ok ? "is-valid" : errors.length ? "has-errors" : ""}`} data-testid="studio-compile-feedback">
          {compileResult?.ok ? <p>Valid strategy <small>Ready to run</small></p> : errors.length ? <div><p>Fix these lines before running:</p>{errors.map((error, index) => { const location = locationForError(error); return <button type="button" className="studio-error-row" key={`${error.code}-${index}`} onClick={() => showErrorLine(error)}><span>{location ? `Line ${location.line}, column ${location.column}: ` : "Strategy: "}{error.message}<small>{error.code}</small></span></button>; })}</div> : <p>Checking your strategy…</p>}
        </div>
        <details className="language-help"><summary>Language help</summary><div className="language-help-content"><p><b>Prices:</b> open, high, low, close, volume</p><p><b>Functions:</b> sma(x,n), ema(x,n), rsi(x,n), delay(x,n), crosses_above(a,b), crosses_below(a,b)</p><p><b>Operators:</b> + − × ÷, &gt;, &lt;, and, or, not</p><p><b>Rules:</b> buy when condition · sell when condition</p><p><b>Settings:</b> size 1–100%; stop_loss 0.1–50%; take_profit 0.1–500%</p><pre>{"fast = sma(close, 10)\nslow = sma(close, 30)\nbuy when crosses_above(fast, slow)\nsell when crosses_below(fast, slow)"}</pre><pre>{"average = ema(close, 20)\nbuy when close > average\nsell when close < average\nstop_loss 5%"}</pre></div></details>
      </div>
      <div className="studio-output-column"><div className="studio-output-tabs" role="tablist" aria-label="Strategy preview"><button type="button" role="tab" aria-selected={panel === "graph"} onClick={() => setPanel("graph")}>Graph</button><button type="button" role="tab" aria-selected={panel === "results"} onClick={() => setPanel("results")}>Results</button></div>
        {panel === "graph" ? <section className="studio-graph-panel" role="tabpanel" aria-label="Graph"><h2>Read-only graph</h2>{!compileResult?.ok && <p className="studio-graph-message" role="status">{errors.length ? "The preview may be incomplete until the marked code is fixed." : "Write a complete strategy to see its graph here."}</p>}<ReadOnlyGraph graph={graph} diagnostics={compilerDiagnostics} sourceMap={sourceMap} /></section>
          : <section className="studio-results-panel" role="tabpanel" aria-label="Results"><h2>Backtest results</h2>{runError && <pre className="studio-run-error" role="alert">{runError}</pre>}{!completed && !runError && <p className="studio-results-empty">Choose settings and select Run backtest to see results.</p>}{completed && <><div className="studio-metrics"><Metric label="Final equity" value={formatRupees(completed.finalEquity)} testId="studio-final-equity" dataValue={completed.finalEquity} /><Metric label="Total return" value={formatPercent(completed.totalReturn)} /><Metric label="Closed trades" value={completed.closedTrades === null ? "n/a" : String(completed.closedTrades)} testId="studio-closed-trades" /><Metric label="Total charges" value={completed.charges === null ? "n/a" : formatRupees(completed.charges)} /></div><p className="studio-engine-time">Engine time: <strong>{completed.engineTimeMs.toFixed(2)} ms</strong> · {completed.barCount.toLocaleString("en-IN")} daily bars</p><EquityChart points={completed.points} testId="studio-equity-chart" /></>}</section>}
      </div>
    </section>
  </main>;
}

/** Reads a bundled language example by filename without copying its source into the component. @example `readExample("sma_crossover.strategy")` returns the checked-in program. */
function readExample(filename: string): string | undefined { const entry = Object.entries(STRATEGY_SOURCES).find(([path]) => path.endsWith(`/${filename}`)); return entry && typeof entry[1] === "string" ? entry[1] : undefined; }
/** Formats rupee values with Indian digit grouping and paise. @example `formatRupees(1234567.89)` returns `₹12,34,567.89`. */
function formatRupees(value: number): string { return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
/** Shows undefined metrics as the specification's `n/a` label. @example `formatPercent(null)` returns `n/a`. */
function formatPercent(value: number | null): string { return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`; }
/** Displays one result summary tile. @example `<Metric label="Final equity" value="₹1,00,000.00" />` formats a run output. */
function Metric({ label, value, testId, dataValue }: { readonly label: string; readonly value: string; readonly testId?: string; readonly dataValue?: number }): React.JSX.Element { return <article><span>{label}</span><strong data-testid={testId} data-value={dataValue}>{value}</strong></article>; }
