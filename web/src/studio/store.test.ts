/** Purpose: checks persistent drafts, example loading, and diagnostic locations. Connects: editor actions to reliable Studio behavior. */
import { describe, expect, it } from "vitest";
import { createStudioEditorStore, locationForError, STUDIO_CODE_KEY, type CodeStorage } from "./store.js";

/** Creates a tiny in-memory storage implementation for browser draft tests. @example `makeStorage().getItem("x")` returns null until written. */
function makeStorage(): CodeStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe("Strategy Studio editor store", () => {
  it("maps compiler feedback to its one-based source line and column", () => {
    expect(locationForError({ line: 4, column: 9 })).toEqual({ line: 4, column: 9 });
    expect(locationForError({ line: 2, startColumn: 3 })).toEqual({ line: 2, column: 3 });
    expect(locationForError({})).toBeNull();
  });

  it("remembers typed strategy code between store visits", () => {
    const storage = makeStorage();
    createStudioEditorStore(storage).getState().setSource("buy when close > 1\nsell when close < 1");
    expect(createStudioEditorStore(storage).getState().source).toContain("buy when close > 1");
    expect(storage.getItem(STUDIO_CODE_KEY)).toContain("sell when close < 1");
  });

  it("loads an example into the editor and remembers its selected name", () => {
    const store = createStudioEditorStore(makeStorage());
    store.getState().loadExample("Moving-average crossover", "fast = sma(close, 10)");
    expect(store.getState()).toMatchObject({ source: "fast = sma(close, 10)", activeExample: "Moving-average crossover" });
  });

  it("undoes an assistant replacement back to the user's previous code", () => {
    const storage = makeStorage();
    const store = createStudioEditorStore(storage);
    store.getState().setSource("my hand-written program");
    store.getState().applyAssistantCode("assistant draft", "my hand-written program");
    store.getState().applyAssistantCode("assistant repair", "my hand-written program");
    store.getState().undoAssistantChange();

    expect(store.getState()).toMatchObject({ source: "my hand-written program", assistantPreviousSource: null });
    expect(storage.getItem(STUDIO_CODE_KEY)).toBe("my hand-written program");
  });
});
