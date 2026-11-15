<!-- Purpose: records how the engine preserves the non-negative-cash property when sell fees exceed proceeds. Connects: sale charge calculation to the trading rules. -->
# 019: Reject sells that would make cash negative

## Context (plain words)
A fixed sell-side charge can be larger than the sale proceeds when a price falls sharply. Recording the fill would make the account's cash negative, contrary to the requested engine property.

## Options considered
- Record a negative cash balance.
- Reduce the specified sell charge.
- Reject the run before recording the sell.

## Decision
Reject the run before a sell that would make cash negative. Do not alter the specified charges.

## Why (beginner level)
This keeps the portfolio from spending money it does not have while preserving the fee schedule exactly as specified.

## Trade-offs
A valid price path can produce an engine error if its sell charges exceed available cash plus proceeds.

## Interview answer (30 seconds)
The fixed DP fee can exceed a very small sale's proceeds after a severe drop. We preserve the exact fee and the non-negative-cash invariant by rejecting that run before recording a negative balance.

