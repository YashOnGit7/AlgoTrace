<!-- Purpose: records stop-loss priority when both exits are reachable. Connects: daily high/low bars to deterministic exit handling. -->
# 009: Stop wins over take-profit

## Context (plain words)
A daily bar can touch both the stop and profit prices, but daily data does not tell which happened first.

## Options considered
- Assume the stop happened first.
- Assume the take-profit happened first.
- Guess the order from the bar's close.

## Decision
When both could trigger on one bar, the stop wins.

## Why (beginner level)
Choosing the less favorable exit avoids claiming a profit that the daily data cannot prove.

## Trade-offs
Some ambiguous bars produce a worse result than a favorable intraday path might have produced.

## Interview answer (30 seconds)
Daily bars hide the path inside the day. We resolve a stop and target collision in favor of the stop, a conservative rule that avoids optimistic assumptions.

