<!-- Purpose: explains the graph compiler in beginner-friendly terms. Connects: AI graphs, canonical ASTs, and Rust/WASM execution. -->
# Phase 3 explained: the TypeScript graph compiler

## What was built
The standalone `@algotrace/compiler` package now exports one function, `compile(graph, config)`. It accepts the plain node/edge format in `/spec/ai-graph-format.md`, not React Flow objects. Its passes validate input, normalize port connections and approved defaults, detect cycles and order nodes with Kahn's algorithm, check types and parameters, remove unreachable nodes with warnings, merge identical computations, run a constant-fold pass, and lower to the canonical version-1 engine AST.

The package includes one invalid graph for each error code AT-E001 through AT-E010, one unreachable-node warning graph, three reference strategy graphs with golden AST files, a fast-check property test, and deterministic output checks. The real-WASM suite compiles each reference graph and executes it on RELIANCE.NS and TCS.NS; all six trade counts match the reference yardsticks.

## Why
The Rust engine should receive a small, predictable AST instead of untrusted canvas or model output. Early validation turns graph mistakes into actionable messages before a backtest runs. Stable sorting means the same graph always gives the same AST bytes.

## Everyday analogy
Think of the compiler as a factory inspection line. First it checks that every part is labeled and connected, then checks that the parts fit, removes unused pieces, combines identical pieces, and packs the result into the engine's standard kit.

## Explain it in one minute
The compiler takes a simple graph made from node IDs, node types, parameters, and input edges. It validates the structure, topologically sorts it while detecting cycles, and checks each connection against the supported data types. It validates required parameters, keeps only nodes that feed the strategy, merges duplicate computations, and emits a stable JSON AST. Errors are grouped by the first failing stage and include a code, a friendly message, and a hint. Vitest tests each error, the golden outputs, determinism, and randomized graphs. A separate integration test runs the compiled AST in the actual WebAssembly build against two frozen stocks.

The v1 constant-fold pass is intentionally a no-op: `/spec/nodes.md` rejects math and comparisons involving two `Number` values, and all remaining operations need a price series. The pass is present for a future spec-defined foldable operation, without inventing algebraic rewrites now.

## Run it

```powershell
pnpm --filter @algotrace/compiler test
pnpm --filter @algotrace/compiler typecheck
pnpm test
pnpm typecheck
pnpm test:wasm
```
