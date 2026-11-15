<!-- Purpose: records the use of frozen daily NSE data. Connects: reproducible demonstrations to price-file provenance. -->
# 003: Frozen NSE data

## Context (plain words)
The presentation needs repeatable runs and a clear record of where prices came from.

## Options considered
- Freeze daily data files for the demo.
- Fetch live prices during each run.

## Decision
Use frozen NSE daily data for the demo, with provenance documented in `/data/README.md` and dataset records.

## Why (beginner level)
The same saved prices let two people repeat a backtest and compare the same result.

## Trade-offs
Frozen prices become stale and do not show current market behavior.

## Interview answer (30 seconds)
We freeze daily data so demo results are reproducible. Each file can be tied to its source and download date instead of changing between runs.

