<!-- Purpose: records compiler defaults and authoritative configuration sources. Connects: normalized graph/config values to the engine AST. -->
# 030: Compiler defaults and cost source

## Context (plain words)
Some graph and backtest settings have specified defaults; adding other defaults could silently change a strategy.

## Options considered
- Fill convenient values for every missing field.
- Apply only the user-approved defaults and require all other non-optional values.

## Decision
Use only documented defaults: strategy position size 100%; capital 100000; slippage 0.05 percentage points; force close false; 252 trading days; annual risk-free rate 0.06 as a decimal fraction; and `zerodha_equity_delivery` costs. Optional stop and take-profit remain absent/off. All other required fields must be supplied. Cost names resolve from `engine/config/cost_presets.json`; custom preset rates must be finite and non-negative.

## Why (beginner level)
One list of defaults keeps graphs predictable. Reading costs from the engine file prevents the compiler and engine from using different rates.

## Trade-offs
The compiler imports JSON outside its package folder, so package tooling must continue supporting JSON modules. A custom full preset must provide its required rates.

## Interview answer (30 seconds)
I filled only the approved defaults and kept the annual risk-free value as 0.06, matching the Rust config. Cost presets come from the engine JSON file rather than a second copy of the rates.
