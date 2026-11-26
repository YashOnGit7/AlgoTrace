/** Purpose: renders the transferred daily equity values as a responsive line chart. Connects: worker arrays to Lightweight Charts. */
import { useEffect, useRef } from "react";
import { createChart, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";

export interface EquityPoint { readonly timestamp: number; readonly equity: number }
interface EquityChartProps { readonly points: readonly EquityPoint[]; readonly testId?: string }

/** Creates and updates the account equity curve. @example `<EquityChart points={dailyValues} />` draws one point per price bar. */
export function EquityChart({ points, testId = "equity-chart" }: EquityChartProps): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);

  useEffect(() => {
    const element = host.current;
    if (element === null) return undefined;
    const created = createChart(element, {
      width: element.clientWidth,
      height: 360,
      layout: { background: { color: "#fcfcf9" }, textColor: "#303b44" },
      grid: { vertLines: { color: "#edf0ed" }, horzLines: { color: "#edf0ed" } },
      rightPriceScale: { borderColor: "#d8dfdb" },
      timeScale: { borderColor: "#d8dfdb", timeVisible: false },
    });
    const line = created.addSeries(LineSeries, { color: "#087e6f", lineWidth: 2, title: "Equity" });
    chart.current = created;
    series.current = line;
    const resizeObserver = new ResizeObserver(() => created.applyOptions({ width: element.clientWidth }));
    resizeObserver.observe(element);
    return () => { resizeObserver.disconnect(); created.remove(); chart.current = null; series.current = null; };
  }, []);

  useEffect(() => {
    if (series.current === null || points.length === 0) return;
    series.current.setData(points.map((point) => ({ time: point.timestamp as UTCTimestamp, value: point.equity })));
    chart.current?.timeScale().fitContent();
  }, [points]);

  return <div className="equity-chart" data-testid={testId} ref={host} aria-label="Daily account equity curve" />;
}
