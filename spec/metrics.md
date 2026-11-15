<!-- Purpose: defines portfolio metrics and undefined-value behavior. Connects: equity and trades to results shown by the UI. -->
# Metrics

`trading_days_per_year` defaults to 252 and `risk_free_rate` defaults to 6% a year; both are in config.

- Total return.
- CAGR = `(final/initial)^(252/bars) - 1`.
- Daily returns from equity.
- Sharpe = `mean(r - rf/252) / sample std(r - rf/252) x sqrt(252)`.
- Sortino = `mean(r - target) / downside deviation x sqrt(trading_days_per_year)`, with the daily target fixed at 0%. Downside deviation is the square root of the mean squared negative return shortfall over all daily returns (non-negative shortfalls contribute zero).
- Maximum drawdown and its length in bars. Drawdown length is measured from the peak bar to the first recovery bar; if the equity has not recovered by the final bar, it is measured through the final bar. The reported length belongs to the drawdown that produced the maximum drawdown.
- Trade count.
- Win rate and profit factor on net-of-charges profit.
- Average net trade.
- Exposure (share of bars holding).
- Total charges paid.
- Buy-and-hold benchmark = close-to-close return of the same instrument rebased to initial capital, without costs.

Exposure is the fraction of bars during which a position was held for any part of that bar.

Undefined metrics are `null`, never `NaN`: Sharpe and Sortino are null when the standard deviation (or downside deviation) is 0 or there are fewer than 2 daily returns; win rate and average trade are null with no closed trades; profit factor is null when gross losses are 0. The UI shows `n/a`.

