<!-- Purpose: explains the strategy graph editor in beginner-friendly language. Connects: node palette, Zustand graph state, compiler feedback, and saved graph JSON. -->
# Phase 6 explained: strategy canvas

## What was built
The app now opens on a strategy canvas, with the earlier WASM backtest demo kept in a separate tab. The palette is grouped into data, indicators, math, signals, and logic/strategy. Every node from `/spec/nodes.md` has its own editor and ports. Parameter inputs show the spec ranges, optional stop-loss and take-profit stay off when empty, and the compiler provides live errors and warnings on their node or input edge.

The graph lives in Zustand in the `/spec/ai-graph-format.md` form: node IDs/types/params and edges. React Flow positions and selection never enter the compiler graph or saved file. The compiler's `canvas-rules` helper reuses its actual type-check pass to decide whether a wire can connect. Dagre arranges connected graphs left to right; unconnected palette nodes are spaced in a grid until edges provide layout order.

The canvas includes Undo/Redo, Delete, Duplicate, JSON save/load, the three reference strategy templates, and a broken-example gallery for every compiler error AT-E001 through AT-E010 plus the AT-W001 warning. The examples load from `/spec/examples/` so there is no second copy of strategy definitions.

## Why
The visual graph is easier to create and inspect than writing JSON by hand. Showing compiler feedback beside the node or wire that caused it lets a beginner fix the problem where it happened. Sharing the compiler's type pass prevents the canvas from inventing a different notion of a valid connection.

## Everyday analogy
Think of the canvas as a board with labeled sockets. Each node is a small machine, and each wire carries a known kind of value. The compiler acts like the board's wiring guide: before a wire is attached, it checks the source and socket types. A warning or error is pinned to the exact part of the board that needs attention.

## Explain it in one minute
The palette creates one of the node types described in the spec. Each node shows the required inputs and permitted parameter range. Zustand holds the graph and its undo history. On every logical graph edit, the app calls the TypeScript compiler. It uses a compiler-exported connection helper while a wire is being drawn, so invalid types are blocked by the same rules used during full compilation. Compiler errors and warnings are shown on the matching card or wire, and clicking a message focuses that part of the canvas. Dagre arranges connected nodes; save/load writes only the AI graph JSON, with no screen coordinates. Three reference templates and fixtures for every compiler error make the workflow easy to demonstrate.

## Acceptance checks
- `pnpm test` covers compiler connection compatibility and Zustand add/connect/undo/redo/duplicate/delete behavior.
- `pnpm typecheck` checks the compiler and web source in strict TypeScript mode.
- The local Playwright test builds a complete SMA crossover through palette clicks and real mouse wires, confirms the compiler accepts it, confirms an incompatible wire is refused with AT-E005 and its beginner-friendly message, then visits all ten error examples and the unreachable-node warning in Chromium.
- The browser test waits until node rectangles stop changing after automatic layout before measuring handle coordinates. This ensures its mouse drag lands on the same port a user sees after the 250 ms fit animation.
- The canvas test keeps its 30-second timeout; the failed 31-second run spent nearly all of that time waiting for the missing-message assertion, not building or connecting the graph. After synchronizing with layout, the canvas test took 6.4 seconds in the full browser run.
- Final checks passed: `pnpm test` (29 tests), `pnpm typecheck`, `pnpm test:wasm` (4 tests), and `pnpm --filter @algotrace/web test:e2e` (2 browser tests).
- `pnpm --filter @algotrace/web build` produces the Vite app.

## Browser test investigation
The saved Playwright trace and screenshot showed the crossover template and a newly added SMA with an unconnected input. The canvas showed the SMA's AT-E006 missing-input diagnostic, and the attempted wire had not been added; no AT-E005 refusal message was visible. The trace recorded the test measuring port positions 150 ms after Auto layout, even though `fitView` animates for 250 ms. The target was still moving as the test dragged, so this was a test timing problem, not a missing app message for a completed refused drop.

The browser test now polls the visible node rectangles until they are stable across repeated samples before starting each mouse drag. It still performs a real pointer drag and asserts both AT-E005 and the plain-English wrong-type explanation. No application code or test timeout was changed.

Playwright remains local-only according to decision [037](../decisions/037-local-playwright-acceptance.md).
