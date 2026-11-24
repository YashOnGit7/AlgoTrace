/** Purpose: tests strategy-source lexing, parsing, graph lowering, diagnostics, and source maps. Connects: source language requirements to compiler results. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compileSource } from "../src/index.js";

const examples = new URL("../../spec/examples/", import.meta.url);
const valid = (body: string): string => `buy when close > 1\nsell when close < 1\n${body}`;
const codeFor = (source: string): { code: string; line: number; column: number }[] => {
  const result = compileSource(source);
  if (result.ok) throw new Error("Expected the source program to fail.");
  return result.errors.map((error) => ({ code: error.code, line: error.line!, column: error.column ?? ("startColumn" in error ? error.startColumn : 1) }));
};

describe("compileSource", () => {
  it.each([
    ["invalid-at-s001.strategy", "AT-S001", 1, 16],
    ["invalid-at-s002.strategy", "AT-S002", 1, 10],
    ["invalid-at-s003.strategy", "AT-S003", 1, 10],
    ["invalid-at-s004.strategy", "AT-S004", 1, 10],
    ["invalid-at-s005.strategy", "AT-S005", 2, 1],
    ["invalid-at-s006.strategy", "AT-S006", 1, 21],
  ] as const)("reports %s at the exact source location", (file, code, line, column) => {
    const source = readFileSync(fileURLToPath(new URL(file, examples)), "utf8");
    expect(codeFor(source)).toContainEqual({ code, line, column });
  });

  it.each(["sma_crossover", "rsi_oversold_overbought", "price_above_sma_stop"])("compiles %s language example to the reference graph shape", (name) => {
    const source = readFileSync(fileURLToPath(new URL(`${name}.strategy`, examples)), "utf8");
    const graphResult = compileSource(source, { cost_preset: "zero_costs", slippage_pct: 0 });
    const graphOnly = JSON.parse(readFileSync(fileURLToPath(new URL(`${name}.json`, examples)), "utf8")) as unknown;
    expect(graphResult.ok).toBe(true);
    if (graphResult.ok) {
      expect(graphResult.graph.edges).toHaveLength((graphOnly as { edges: unknown[] }).edges.length);
      expect(graphResult.graph.nodes.map((node) => node.id)).toEqual(graphResult.graph.nodes.map((_, index) => `n${index + 1}`));
      expect(Object.keys(graphResult.sourceMap)).toEqual(graphResult.graph.nodes.map((node) => node.id));
    }
  });

  it("treats CRLF, LF, missing final newline, comments, and a quoted hash identically", () => {
    const lf = 'strategy "name # stays" # trailing comment\nbuy when close > 1\nsell when close < 1';
    const crlf = lf.replaceAll("\n", "\r\n");
    const a = compileSource(lf), b = compileSource(crlf);
    expect(a.ok).toBe(true); expect(b.ok).toBe(true);
    if (a.ok && b.ok) { expect(JSON.stringify(a.graph)).toBe(JSON.stringify(b.graph)); expect(JSON.stringify(a.ast)).toBe(JSON.stringify(b.ast)); }
  });

  it("allows rules before unrelated assignments while enforcing use-before-assignment", () => {
    const result = compileSource("buy when close > 1\nsell when close < 1\naverage = sma(close, 2)");
    expect(result.ok).toBe(true);
    expect(codeFor("buy when future > 1\nfuture = sma(close, 2)\nsell when close < 1")).toContainEqual({ code: "AT-S004", line: 1, column: 10 });
  });

  it("allows settings before rules and in interleaved order", () => {
    expect(compileSource("size 50%\nsell when close < 1\nstop_loss 5%\nbuy when close > 1\ntake_profit 10%").ok).toBe(true);
  });

  it("maps compiler type errors back to the expression source span", () => {
    const result = compileSource("buy when close and close\nsell when close < 1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.find((error) => error.code === "AT-E005")).toMatchObject({ line: 1, column: 10 });
  });

  it("adds lowercase guidance for uppercase keywords and functions", () => {
    const keywordError = compileSource("BUY when close > 1\nsell when close < 1");
    expect(keywordError.ok).toBe(false);
    if (!keywordError.ok) expect(keywordError.errors.some((error) => error.code === "AT-S002" && error.hint.includes("lowercase"))).toBe(true);
    const result = compileSource("buy when SMA(close, 2) > 1\nsell when close < 1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === "AT-S003" && error.hint.includes("lowercase"))).toBe(true);
  });

  it("returns stable graph, AST, warning, and source-map bytes for repeated source", () => {
    const source = 'buy when crosses_above(sma(close, 2), 1)\nsell when close < 1\nsize 100%';
    const serialize = (): string => JSON.stringify(compileSource(source));
    expect(serialize()).toBe(serialize());
  });

  it("never throws for arbitrary text or grammar-shaped random programs", () => {
    fc.assert(fc.property(fc.string(), (source) => { expect(() => compileSource(source)).not.toThrow(); return true; }), { numRuns: 500 });
    const expr = fc.constantFrom("close > 2", "close < 3", "crosses_above(close, 4)", "not (close < 5)");
    fc.assert(fc.property(expr, expr, fc.integer({ min: 2, max: 500 }), (buy, sell, period) => {
      const source = `average = sma(close, ${period})\nbuy when ${buy}\nsize 75%\nsell when ${sell}`;
      const result = compileSource(source);
      expect(result.ok).toBe(true);
    }), { numRuns: 500 });
  });
});
