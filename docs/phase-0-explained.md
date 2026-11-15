<!-- Purpose: explains the repository setup phase for a beginner. Connects: project layout and specifications to the next implementation phase. -->
# Phase 0 explained

## What was built
The repository has its first folder structure, setup files, source specifications, decisions, and checks. The engine, compiler, and web page are still scaffolds.

The pnpm workspace installed from its lockfile, both workspace test commands completed with no test files, both TypeScript packages passed strict type checking, and the web production build passed. The API and reference setup smoke tests each passed once. Rust checks were not run because Cargo is not installed on the local machine.

## Why
Before implementing backtesting behavior, the project needs agreed file formats, rules, and a repeatable place for each part.

## Everyday analogy
This phase is like drawing the labeled rooms and wiring plan for a house before building the walls and installing appliances.

## Explain it in one minute
AlgoTrace is split into a browser app, a TypeScript compiler, a Rust engine, and a small Python API. We wrote the shared rules first so each component can agree on node types, trading time, charges, and output formats. The initial scaffold provides local setup and automated checks, but it does not yet run a backtest.

