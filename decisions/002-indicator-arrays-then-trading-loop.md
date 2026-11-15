<!-- Purpose: records the engine's calculation order. Connects: indicators and signals to sequential order execution. -->
# 002: Compute indicator arrays then one trading loop

## Context (plain words)
Indicators use past price bars, while trades update cash and holdings over time.

## Options considered
- Calculate indicators first, then walk through bars once for trading.
- Recalculate indicator values inside every trading step.

## Decision
Compute whole indicator arrays, then use one trading loop.

## Why (beginner level)
Keeping signal calculation separate from cash and position changes makes the engine easier to explain and inspect.

## Trade-offs
Indicator arrays use memory, and separate stages require clear interfaces.

## Interview answer (30 seconds)
We calculate indicator series once, then walk through bars in order to execute trades. This separates math from portfolio bookkeeping and makes timing easier to audit.

