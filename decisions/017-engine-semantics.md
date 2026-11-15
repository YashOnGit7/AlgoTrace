<!-- Purpose: records the user's clarifications needed for engine calculations. Connects: cost, trading, data, and metrics rules to implementation. -->
# 017: Engine semantics clarifications

## Context (plain words)
The source specifications left several calculation details open. The user selected explicit rules before engine implementation.

## Options considered
- Keep these details undefined and stop before implementing affected behavior.
- Apply the user's selected rules consistently in the specifications and engine.

## Decision
- Cost fields ending in `_pct` use percentage points; for example, `0.1` means 0.1% and is divided by 100.
- Stop-loss and take-profit fills use the target price or gap open without additional slippage.
- Sortino uses a 0% downside target and the annualization formula in `/spec/metrics.md`. Downside deviation is the root mean square of negative shortfalls over all daily returns.
- Maximum drawdown duration runs from its peak bar to the first recovery bar, or through the final bar if not recovered.
- Reject runs with OHLC values that are non-finite, non-positive, or outside the low/high range.
- Exposure counts a bar if a position was held for any part of that bar.

## Why (beginner level)
Fixed rules make results repeatable and keep one run from interpreting the same price bar differently from another.

## Trade-offs
These conventions make edge cases predictable, but they must be applied consistently by the reference calculations too.

## Interview answer (30 seconds)
Before writing the engine, we resolved how cost percentages are represented, how stops and targets fill, how Sortino and drawdown duration work, and which OHLC bars are invalid. The same choices are written into the specs so code and tests can follow them.

