<!-- Purpose: records the demo's run timing, charge toggle, and reference count labels. Connects: compiler defaults and engine metrics to the page summaries. -->
# 036: Demo run timing and trade-count labels

## Context (plain words)
The first WASM call includes startup work, and the reference comparator's trade-record total differs from the spec's closed-trade metric when a position remains open.

## Options considered
- Show one runtime and label the vectorbt record total as closed trades.
- Show startup and stable engine times separately and keep closed count distinct from all trade records.

## Decision
Page load performs a startup run and then a second display run on the same loaded prices. The page shows the first startup-inclusive time, the second WASM time, and total elapsed time beginning before fetch. `zero_costs` is selected by default; the Indian charges checkbox selects `zerodha_equity_delivery` and reruns. The page reports 78 closed trades under the spec and separately explains that the vectorbt reference has 79 records including one open position.

## Why (beginner level)
Separating the cold run makes timing easier to interpret. An open position is not a closed trade, so the UI must preserve the spec's trade-count meaning while still explaining the reference's 79-record total.

## Trade-offs
The cost toggle refetches the same frozen file and performs one additional run. It does not repeat the startup warm-up.

## Interview answer (30 seconds)
The first call includes WASM initialization, so I run twice and show both timings. The reference has 79 trade records but one is open; the spec counts closed trades only, so the page correctly shows 78 closed and labels 79 as total records.
