<!-- Purpose: records end-to-end compiler validation through real WASM. Connects: TypeScript graphs to known frozen-data trade counts. -->
# 033: Compiler to real-WASM acceptance

## Context (plain words)
Unit tests can prove AST formatting, but they do not prove the Rust engine accepts the compiled AST.

## Options considered
- Test only compiler outputs in Vitest.
- Extend the existing real-WASM test command to run all examples on two frozen stocks.

## Decision
The `pnpm test:wasm` command runs the three checked-in examples through `compile`, then runs their ASTs in the actual built WebAssembly module for RELIANCE.NS and TCS.NS. With zero costs/slippage and matching reference settings, counts are 79/17/236 and 77/16/229 respectively. CI already invokes `pnpm test:wasm`, so it includes this check.

## Why (beginner level)
The real integration proves the compiler and Rust agree on the AST contract and gives a known market-history result to catch accidental changes.

## Trade-offs
The integration test requires building WASM and reading the frozen AGT1 files, so it runs in the slower WASM test job.

## Interview answer (30 seconds)
I compiled each of the three documented strategy graphs and sent the ASTs to the real Rust/WASM engine for two stocks. Their trade counts match the vectorbt comparison settings, which verifies the connection from graph input to engine execution.
