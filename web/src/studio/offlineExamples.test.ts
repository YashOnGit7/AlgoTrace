/** Purpose: proves every offline demo is fixed, unique, and compiler-valid. Connects: static sentences to the approved strategy compiler. */
import { describe, expect, it } from "vitest";
import { compileSource } from "@algotrace/compiler";
import { findOfflineExample, OFFLINE_EXAMPLES } from "./offlineExamples.js";

describe("offline assistant examples", () => {
  it("provides exactly five distinct sentence-to-code answers that compile", () => {
    expect(OFFLINE_EXAMPLES).toHaveLength(5);
    expect(new Set(OFFLINE_EXAMPLES.map((example) => example.sentence)).size).toBe(5);
    for (const example of OFFLINE_EXAMPLES) {
      expect(compileSource(example.code).ok, example.label).toBe(true);
    }
  });

  it("matches only one of the five fixed sentences", () => {
    expect(findOfflineExample(` ${OFFLINE_EXAMPLES[0]?.sentence} `)?.id).toBe("sma_crossover");
    expect(findOfflineExample("buy when it looks cheap")).toBeUndefined();
  });
});
