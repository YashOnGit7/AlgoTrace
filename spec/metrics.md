<!-- Purpose: defines portfolio metrics and undefined-value behavior. Connects: equity and trades to results shown by the UI. -->
# Metrics

`trading_days_per_year` defaults to 252 and `risk_free_rate` defaults to 6% a year; both are in config. Use the configured trading-day count in all annualization and daily risk-free calculations.

- Total return.
- CAGR = `(final/initial)^(trading_days_per_year/bars) - 1`.
- Daily returns from equity.
- Sharpe = `mean(r - rf/trading_days_per_year) / sample std(r - rf/trading_days_per_year) x sqrt(trading_days_per_year)`.
- Sortino target is the daily risk-free rate, `risk_free_rate / trading_days_per_year`. Sortino = `mean(r - target) / downside deviation x sqrt(trading_days_per_year)`. Downside deviation is the square root of the mean of `min(0, r - target)^2` over all daily returns.
- Maximum drawdown and its length in bars. Drawdown length is the longest run of bars from an equity peak until the first bar whose equity is at or above that peak. If it never recovers, count through the last bar.
- Trade count.
- Win rate and profit factor on net-of-charges profit.
- Average net trade.
- Exposure (share of bars holding).
- Total charges paid.
- Buy-and-hold benchmark = close-to-close return of the same instrument rebased to initial capital, without costs.

Exposure is the fraction of bars during which a position was held for any part of that bar.

Undefined metrics are `null`, never `NaN`: Sharpe and Sortino are null when the standard deviation (or downside deviation) is 0 or there are fewer than 2 daily returns; win rate and average trade are null with no closed trades; profit factor is null when gross losses are 0. The UI shows `n/a`.

