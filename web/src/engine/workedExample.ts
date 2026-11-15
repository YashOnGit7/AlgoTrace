/**
 * Purpose: turns the checked-in crossover fixture and strategy into browser-test inputs.
 * Connects: the native 20-bar fixture to the WASM demo and real-module integration test.
 */

import crossoverCsv from "../../../engine/tests/fixtures/crossover_20.csv?raw";

/**
 * Encodes the checked-in rows in the AGT1 column-major little-endian layout.
 * @example `const agt1 = encodeCrossoverFixture();`
 */
export function encodeCrossoverFixture(): Uint8Array {
  const rows = crossoverCsv
    .split(/\r?\n/)
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .slice(1)
    .map((line) => line.split(",").map(Number));
  const barCount = rows.length;
  const bytes = new Uint8Array(16 + barCount * 6 * Float64Array.BYTES_PER_ELEMENT);
  bytes.set([65, 71, 84, 49], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, barCount, true);
  for (let column = 0; column < 6; column += 1) {
    for (let bar = 0; bar < barCount; bar += 1) {
      const value = rows[bar]?.[column];
      if (value === undefined || !Number.isFinite(value)) {
        throw new Error(`Fixture row ${bar + 1} has no finite value for column ${column}.`);
      }
      const byteOffset = 16 + (column * barCount + bar) * Float64Array.BYTES_PER_ELEMENT;
      view.setFloat64(byteOffset, value, true);
    }
  }
  return bytes;
}

/**
 * Builds the zero-cost SMA(2)/SMA(3) crossover AST used by the native worked example.
 * @example `const astJson = crossoverStrategyJson();`
 */
export function crossoverStrategyJson(): string {
  return JSON.stringify({
    version: 1,
    config: {
      initial_capital: 1000,
      slippage_pct: 0,
      cost_preset: {},
      force_close_at_end: false,
      risk_free_rate: 0.06,
      trading_days_per_year: 252,
    },
    nodes: [
      { id: "close", op: "PRICE", params: { field: "close" }, inputs: {} },
      { id: "fast", op: "SMA", params: { period: 2 }, inputs: { input: "close" } },
      { id: "slow", op: "SMA", params: { period: 3 }, inputs: { input: "close" } },
      {
        id: "entry",
        op: "CROSSES_ABOVE",
        params: {},
        inputs: { a: "fast", b: "slow" },
      },
      {
        id: "exit",
        op: "CROSSES_BELOW",
        params: {},
        inputs: { a: "fast", b: "slow" },
      },
      {
        id: "strategy",
        op: "STRATEGY",
        params: { position_size_pct: 100 },
        inputs: { entry: "entry", exit: "exit" },
      },
    ],
    sink: "strategy",
  });
}
