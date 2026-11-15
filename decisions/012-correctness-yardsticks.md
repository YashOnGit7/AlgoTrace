<!-- Purpose: records independent correctness comparison tools. Connects: engine outputs to reference checks. -->
# 012: vectorbt plus Zerodha calculator as correctness yardsticks

## Context (plain words)
The engine needs independent comparisons for strategy behavior and transaction charges.

## Options considered
- Compare against vectorbt for strategies and a Zerodha charges calculator for costs.
- Trust only the engine's own output.

## Decision
Use vectorbt plus a Zerodha-style charges calculator as correctness yardsticks.

## Why (beginner level)
An independent calculation can reveal mistakes that comparing an engine to itself would miss.

## Trade-offs
Differences in fill timing and cost assumptions must be aligned before comparing.

## Interview answer (30 seconds)
We compare selected strategies with vectorbt and charges with a separate calculator. The reference rules must use the same timing and fee assumptions for a fair check.

