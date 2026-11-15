<!-- Purpose: records approved resolutions for specification gaps. Connects: the seven clarifications to matching normative specifications. -->
# 016: Specification gap resolutions (DRAFT)

**Status: DRAFT**

## Context (plain words)
The initial specification left several implementation details open. The user supplied the rules below for this draft record.

## Options considered
- Leave each behavior undefined and defer the related implementation.
- Apply the supplied rules consistently in the specification.

## Decision
Apply these seven rules; the matching specifications contain the normative wording.

1. **G1 — Optional parameters:** `stop_loss_pct` is 0.1 to 50 and `take_profit_pct` is 0.1 to 500. Omitted means off; out of range is `AT-E007`.
2. **G2 — Deterministic AST:** Kahn's algorithm; among ready nodes, smallest id by plain string comparison. When duplicate nodes merge, smallest id survives. JSON node keys are `id`, `op`, `params`, `inputs`; keys within `params` and `inputs` sort alphabetically. Use 2-space indentation, trailing newline, and no timestamps.
3. **G3 — Undefined metrics:** serialize as `null`, never `NaN`. Sharpe and Sortino are null for zero deviation or fewer than two daily returns; win rate and average trade are null with no closed trades; profit factor is null when gross losses are zero. UI displays `n/a`.
4. **G4 — End of data:** when forced, sell at final close with sell slippage, normal sell charges, and reason `end_of_data`. Otherwise retain the position at the last close without charges, show it as open, and exclude it from trade count, win rate, and profit factor.
5. **G5 — Rounding:** no engine rounding (`f64`, no tick-size rounding); calculate charges per fill; display to two decimals (paise). Charge test tolerance is Rs 0.01 and all other test tolerance is `1e-6`.
6. **G6 — Warm-up and invalid bars:** SMA/EMA valid from index `period-1`, EMA seeded with that SMA; RSI valid from index `period`, with RSI 100 when average loss is zero and 50 when both average gain and loss are zero. Crossovers require valid values for both series at `t-1` and `t`; `DELAY(n)` starts with `n` invalid values (`NaN` or false).
7. **G7 — Final-bar signal:** a signal on the final bar creates no order because no next bar exists.

## Why (beginner level)
These rules make edge cases predictable so two implementations can produce the same output.

## Trade-offs
The decisions are explicit and testable, but this record remains a draft and can be reviewed before implementation hardens around it.

## Interview answer (30 seconds)
We resolved seven missing details about parameters, ordering, undefined metrics, closing positions, rounding, warm-up, and final-bar signals. They are written into the matching specs so the compiler and engine share the same rules.

