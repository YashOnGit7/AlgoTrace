<!-- Purpose: records annualization and risk-free assumptions for metrics. Connects: daily returns to Sharpe and Sortino outputs. -->
# 011: Sharpe settings

## Context (plain words)
Risk metrics need assumptions about the number of trading days and the yearly risk-free rate.

## Options considered
- Make the settings visible in run configuration.
- Hide the assumptions inside metric formulas.

## Decision
Use configurable `trading_days_per_year` (default 252) and `risk_free_rate` (default 6% annually), with the Sharpe formula defined in `/spec/metrics.md`.

## Why (beginner level)
Visible settings let a reader see what assumptions change the score.

## Trade-offs
Results can differ if the settings differ, so they must travel with the run configuration.

## Interview answer (30 seconds)
We expose the annual trading-day count and risk-free rate in configuration. The metric formula is fixed by the specification, making the assumptions inspectable.

