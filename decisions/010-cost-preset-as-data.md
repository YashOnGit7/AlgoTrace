<!-- Purpose: records storage of delivery charges as configuration data. Connects: cost rates to engine calculations. -->
# 010: Zerodha-style cost preset stored as data

## Context (plain words)
Charge rates can change and should not be buried in calculation code.

## Options considered
- Store the preset in a dated data file with a source URL.
- Hardcode rates inside the engine.

## Decision
Store `zerodha_equity_delivery` in `engine/config/cost_presets.json`, with the supplied as-of date and source URL.

## Why (beginner level)
Rates can be reviewed and replaced as data without changing the cost calculation logic.

## Trade-offs
The data file must be kept in sync with `/spec/costs.md` and checked for freshness.

## Interview answer (30 seconds)
The engine reads the charges preset as data. That makes the rate source and as-of date visible and keeps arithmetic separate from market-specific values.

