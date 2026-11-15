<!-- Purpose: records the equity delivery product assumption. Connects: the chosen market product to the delivery cost preset. -->
# 006: Delivery product

## Context (plain words)
The cost model and decision list refer to equity delivery, while the engine covers daily NSE equities.

## Options considered
- Equity delivery trades.
- Intraday, futures, or options trading.

## Decision
Use equity delivery for this presentation version. This follows the `zerodha_equity_delivery` preset and the stated scope; the project does not simulate intraday, futures, or options.

## Why (beginner level)
One product type keeps the costs and rules narrower and easier to explain.

## Trade-offs
Results do not represent other product types.

## Interview answer (30 seconds)
We model delivery trades for daily NSE equities. The cost preset is delivery-specific, and the brief excludes intraday and derivatives.

