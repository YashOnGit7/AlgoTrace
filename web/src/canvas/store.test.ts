/** Purpose: checks shared graph editing, whole-share-safe graph payloads, and history. Connects: palette and toolbar actions to the Zustand store contract. */
import { afterEach, describe, expect, it } from "vitest";
import { useStrategyStore } from "./store.js";

afterEach(() => useStrategyStore.getState().clearGraph());

describe("canvas graph store", () => {
  it("stores compiler-format connections and restores them with undo and redo", () => {
    useStrategyStore.getState().addNode("PRICE", { x: 10, y: 20 });
    useStrategyStore.getState().addNode("SMA", { x: 300, y: 20 });
    const state = useStrategyStore.getState();
    const price = state.nodes[0];
    const sma = state.nodes[1];
    expect(price).toBeDefined();
    expect(sma).toBeDefined();
    if (price === undefined || sma === undefined) throw new Error("The two added nodes should exist.");
    useStrategyStore.getState().connect({ from: price.data.graphId, to: sma.data.graphId, port: "input" });
    expect(useStrategyStore.getState().strategyGraph().edges).toEqual([{ from: price.data.graphId, to: sma.data.graphId, port: "input" }]);
    useStrategyStore.getState().undo();
    expect(useStrategyStore.getState().strategyGraph().edges).toHaveLength(0);
    useStrategyStore.getState().redo();
    expect(useStrategyStore.getState().strategyGraph().edges).toHaveLength(1);
  });

  it("duplicates a selected node with a fresh compiler ID and allows deleting the original", () => {
    useStrategyStore.getState().addNode("PRICE", { x: 0, y: 0 });
    const original = useStrategyStore.getState().nodes[0];
    if (original === undefined) throw new Error("The palette action should create its node.");
    useStrategyStore.getState().applyNodes([{ id: original.id, type: "select", selected: true }]);
    useStrategyStore.getState().duplicateSelected();
    const duplicated = useStrategyStore.getState().nodes;
    expect(duplicated).toHaveLength(2);
    expect(duplicated[0]?.data.graphId).not.toBe(duplicated[1]?.data.graphId);
    useStrategyStore.getState().deleteSelected();
    expect(useStrategyStore.getState().nodes).toHaveLength(1);
  });

  it("applies only the documented position-size default to a new strategy node", () => {
    useStrategyStore.getState().addNode("STRATEGY", { x: 0, y: 0 });
    expect(useStrategyStore.getState().nodes[0]?.data.params).toEqual({ position_size_pct: 100 });
  });
});
