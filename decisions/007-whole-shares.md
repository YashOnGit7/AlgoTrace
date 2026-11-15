<!-- Purpose: records integer share sizing. Connects: position sizing to available cash and charges. -->
# 007: Whole shares

## Context (plain words)
A budget may not buy an exact fraction of a share.

## Options considered
- Whole shares only.
- Fractional share quantities.

## Decision
Buy the largest whole number of shares that fits the position budget including buy-side charges.

## Why (beginner level)
The simulated quantity remains an integer and cannot exceed the stated budget.

## Trade-offs
Some cash may remain unused after buying whole shares.

## Interview answer (30 seconds)
We search for the largest integer share count that fits after charges. That follows the brief and avoids fractional shares in the portfolio.

