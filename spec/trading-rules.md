<!-- Purpose: defines order timing, fill behavior, and position lifecycle. Connects: compiled signals to engine trades and equity. -->
# Trading rules

Bars are daily; index `t` is a bar; signal series are computed with data up to the close of bar `t`.

1. A signal true at bar `t` creates an order that fills at the OPEN of bar `t+1`. This is the no-look-ahead rule.
2. Entry: if flat and `entry[t]` is true, buy at `open[t+1]`.
3. Exit: if holding and `exit[t]` is true, sell at `open[t+1]`. If entry and exit are both true while flat, do nothing.
4. Slippage (default 0.05%): buys fill at open x (1 + slippage), sells at open x (1 - slippage).
5. Position size: `budget = position_size_pct / 100 x cash`. Shares are the largest whole number `n` so that `n x fill price` plus all buy-side charges fits within the budget. If `n` is 0, skip the trade.
6. Stop-loss: stop price = entry fill price x (1 - stop_loss_pct/100). From the entry bar onward, if low <= stop price, sell at the stop price, or at the open if the bar opened below the stop (gap). Take-profit is the mirror using high. If both could trigger in the same bar, the stop wins.
   Stop-loss is a market-style exit and applies sell slippage against the position: fill at `stop price x (1 - slippage)`, or on a gap at `open x (1 - slippage)`. Take-profit is a limit order and has no slippage: fill at `max(open, target price)`.
7. If a position is closed by a stop or take-profit, no new entry on that same bar.
8. End of data: mark any open position to market at the last close and flag it open, unless `force_close_at_end` is true. If true, sell at the last bar close with slippage applied (`close x (1 - slippage)`), charged as a normal sell, with exit reason `end_of_data`. If false, the position stays open: valued at the last close, no charges, shown as an open trade, and excluded from trade count, win rate, and profit factor.
9. Equity is recorded at every bar close: cash plus shares x close.
10. Prices are split/bonus/dividend adjusted consistently across open, high, low, close.
11. A signal on the final bar creates no order, because there is no next bar.
12. If sell-side charges would make cash negative, reject the run before recording the sell; cash is never recorded below zero.

13. **G15 — Order of events on one bar:** scheduled orders (entries and signal exits) fill at the open first. Stop-loss and take-profit apply only to a position that is still held after the open. If a scheduled signal exit and a stop trigger on the same bar, the signal exit at the open wins (fill = open x (1 - slippage), exit reason `signal`). If the open itself is already beyond the stop, the fill is still at the open with slippage, and the exit reason is `signal` when an exit was scheduled, otherwise `stop`.

