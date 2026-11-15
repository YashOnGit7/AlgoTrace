/**
 * Purpose: checks the web wrapper copies prices once and refreshes views after memory growth.
 * Connects: Vitest behavior checks to the wasm-bindgen memory and result contract.
 */

import { describe, expect, it } from "vitest";

import { WasmEngineClient, type WasmEngineExports } from "./wasmClient";

/** Simulates WASM linear memory whose buffer is replaced when it grows. */
class GrowingMemory {
  public buffer: ArrayBuffer = new ArrayBuffer(64);

  /**
   * Grows simulated memory while preserving bytes from the old buffer.
   * @example `memory.grow(128)` imitates a Rust allocation that expands WASM memory.
   */
  public grow(byteLength: number): void {
    const next = new ArrayBuffer(byteLength);
    new Uint8Array(next).set(new Uint8Array(this.buffer));
    this.buffer = next;
  }
}

/**
 * Creates a mock module that grows memory during allocation and backtest calls.
 * @example `const { client } = createMockEngine()` gives a client for wrapper tests.
 */
function createMockEngine(): { readonly client: WasmEngineClient; readonly memory: GrowingMemory } {
  const memory = new GrowingMemory();
  const exports = {
    memory,
    reserve_price_buffer(byteLength: number): number {
      memory.grow(128);
      return 16 + byteLength;
    },
    free_price_buffer(): void {},
    run_backtest(): void {
      memory.grow(256);
      new Float64Array(memory.buffer, 32, 2).set([10, 11]);
      for (let column = 0; column < 21; column += 1) {
        new Float64Array(memory.buffer, 64 + column * 8, 1).set([column + 1]);
      }
    },
    equity_ptr(): number {
      return 32;
    },
    equity_len(): number {
      return 2;
    },
    trade_column_count(): number {
      return 21;
    },
    trade_column_ptr(column: number): number {
      return 64 + column * 8;
    },
    trade_column_len(): number {
      return 1;
    },
    metrics_json(): string {
      return "{\"total_return\":0.1}";
    },
    free_backtest_results(): void {},
    run_sweep_json(): string {
      memory.grow(512);
      return "[{\"value\":5,\"metrics\":{\"total_return\":0.1}}]";
    },
  } satisfies Omit<WasmEngineExports, "memory"> & { readonly memory: GrowingMemory };
  const client = new WasmEngineClient(exports as unknown as WasmEngineExports);
  return { client, memory };
}

describe("WasmEngineClient", () => {
  it("copies prices once into the buffer returned after reserve growth", () => {
    const { client, memory } = createMockEngine();
    const input = new Uint8Array([65, 71, 84, 49]);

    client.loadPrices(input);

    expect(Array.from(new Uint8Array(memory.buffer, 20, 4))).toEqual([65, 71, 84, 49]);
  });

  it("creates result views from the current memory buffer after a run grows it", () => {
    const { client, memory } = createMockEngine();
    client.loadPrices(new Uint8Array([1, 2, 3, 4]));
    const bufferBeforeRun = memory.buffer;

    const result = client.runBacktest("{}");

    expect(memory.buffer).not.toBe(bufferBeforeRun);
    expect(Array.from(result.equity)).toEqual([10, 11]);
    expect(Array.from(result.trades.entry_bar)).toEqual([1]);
  });

  it("returns validated sweep summaries after the sweep grows WASM memory", () => {
    const { client, memory } = createMockEngine();
    client.loadPrices(new Uint8Array([1, 2, 3, 4]));
    client.runBacktest("{}");
    const oldBuffer = memory.buffer;

    const response = client.runSweep("{}", "fast", "period", [5]);

    expect(memory.buffer).not.toBe(oldBuffer);
    expect(response.points).toEqual([{ value: 5, metrics: { total_return: 0.1 } }]);
    expect(Array.from(response.results.equity)).toEqual([10, 11]);
  });
});
