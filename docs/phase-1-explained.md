<!-- Purpose: explains the pure-Rust engine phase in beginner-friendly language. Connects: engine modules and tests to the written rules. -->
# Phase 1 explained

## What was built
The engine now reads AGT1 price files through a borrowed view, calculates SMA/EMA/RSI, evaluates the strategy AST, simulates long-only trades with charges and protective exits, calculates the specified metrics, and runs parameter sweeps with reusable buffers. The Rust crate is native pure Rust in this phase; WebAssembly bindings are not included.

## Why
These modules turn the compiler's structured strategy and daily price data into repeatable trades, account values, and performance measurements. Tests compare small cases with hand calculations and check the no-look-ahead rule.

## Everyday analogy
The price view is like a library card catalog: it points to the original pages and reads only the requested number. The evaluator marks possible actions, the simulator acts like a careful cashier moving money and shares, and the metrics module summarizes the account's journey.

## Explain it in one minute
The Rust engine reads the binary prices without making six duplicate arrays. It computes indicators and boolean signals in dependency order, then walks through the bars in time order. A signal at today's close can only trade at tomorrow's open. The simulator counts whole shares, applies per-fill fees and slippage, checks stops and targets, and records equity at every close. Tests compare a 20-bar crossover with hand-worked numbers and change future prices to prove earlier outputs stay fixed. A sweep reuses the same price view and working buffers.

## Verification
`cargo test` passed all 35 integration tests, including proptest-generated cases. `cargo fmt --check` and Clippy with warnings denied both passed. Exact command output is recorded in the session notes.

