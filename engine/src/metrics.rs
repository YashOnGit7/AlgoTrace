//! Purpose: calculates return, risk, trade, exposure, fee, and benchmark metrics.
//! Connects: completed simulator output to the results screen and sweep summaries.

use crate::types::{EngineError, EngineResult, EquityPoint, Metrics, StrategyConfig, Trade};

/// Calculates every metric defined by `/spec/metrics.md` from a daily equity curve.
///
/// Example: `calculate_metrics(&curve, &trades, &config, held_bars, fees)?` returns typed metrics with nulls as `None`.
pub fn calculate_metrics(
    equity: &[EquityPoint],
    trades: &[Trade],
    config: &StrategyConfig,
    holding_bars: usize,
    total_charges: f64,
) -> EngineResult<Metrics> {
    if equity.is_empty() {
        return Err(EngineError::new(
            "metrics require at least one equity point",
        ));
    }
    let last = equity.last().expect("first exists when last is requested");
    let initial = config.initial_capital;
    let total_return = last.equity / initial - 1.0;
    let cagr = (last.equity / initial)
        .powf(config.trading_days_per_year as f64 / equity.len() as f64)
        - 1.0;
    let daily_risk_free = config.risk_free_rate / config.trading_days_per_year as f64;
    let sharpe = sharpe_ratio(equity, daily_risk_free, config.trading_days_per_year)?;
    let sortino = sortino_ratio(
        equity,
        config.risk_free_rate / config.trading_days_per_year as f64,
        config.trading_days_per_year,
    )?;
    let (max_drawdown, max_drawdown_length) = max_drawdown(equity);
    let trade_count = trades
        .iter()
        .filter(|trade| trade.exit_bar.is_some())
        .count();
    let (win_rate, average_net_trade, profit_factor) = trade_metrics(trades);
    let buy_and_hold_return = last.buy_and_hold / initial - 1.0;
    Ok(Metrics {
        total_return,
        cagr,
        sharpe,
        sortino,
        max_drawdown,
        max_drawdown_length,
        trade_count,
        win_rate,
        profit_factor,
        average_net_trade,
        exposure: holding_bars as f64 / equity.len() as f64,
        total_charges,
        buy_and_hold_return,
    })
}

/// Calculates the annualized Sharpe ratio with sample standard deviation.
///
/// Example: two identical risk-adjusted daily returns have zero sample deviation and return `None`.
fn sharpe_ratio(
    equity: &[EquityPoint],
    daily_risk_free: f64,
    trading_days: u32,
) -> EngineResult<Option<f64>> {
    let returns = equity.len().saturating_sub(1);
    if returns < 2 {
        return Ok(None);
    }
    let mut adjusted_sum = 0.0;
    for pair in equity.windows(2) {
        validate_return_pair(pair[0].equity, pair[1].equity)?;
        adjusted_sum += pair[1].equity / pair[0].equity - 1.0 - daily_risk_free;
    }
    let adjusted_mean = adjusted_sum / returns as f64;
    let mut squared_error = 0.0;
    for pair in equity.windows(2) {
        let adjusted = pair[1].equity / pair[0].equity - 1.0 - daily_risk_free;
        squared_error += (adjusted - adjusted_mean).powi(2);
    }
    let sample_std = (squared_error / (returns - 1) as f64).sqrt();
    Ok((sample_std > 0.0).then_some(adjusted_mean / sample_std * (trading_days as f64).sqrt()))
}

/// Calculates annualized Sortino using the zero-percent target and all return periods.
///
/// Example: a return list with no negative values has zero downside deviation and returns `None`.
fn sortino_ratio(
    equity: &[EquityPoint],
    daily_target: f64,
    trading_days: u32,
) -> EngineResult<Option<f64>> {
    let returns = equity.len().saturating_sub(1);
    if returns < 2 {
        return Ok(None);
    }
    let mut sum = 0.0;
    let mut downside_sum = 0.0;
    for pair in equity.windows(2) {
        validate_return_pair(pair[0].equity, pair[1].equity)?;
        let excess_return = pair[1].equity / pair[0].equity - 1.0 - daily_target;
        sum += excess_return;
        downside_sum += excess_return.min(0.0).powi(2);
    }
    let mean = sum / returns as f64;
    let downside_mean_square = downside_sum / returns as f64;
    let downside_deviation = downside_mean_square.sqrt();
    Ok((downside_deviation > 0.0)
        .then_some(mean / downside_deviation * (trading_days as f64).sqrt()))
}

/// Validates a close-to-close return pair before using it in a risk formula.
///
/// Example: `(100.0, 110.0)` is a valid pair; a zero prior equity is rejected.
fn validate_return_pair(previous: f64, current: f64) -> EngineResult<()> {
    if previous <= 0.0 || !previous.is_finite() || !current.is_finite() {
        return Err(EngineError::new(
            "equity values must be finite and prior equity must be positive",
        ));
    }
    Ok(())
}

/// Finds the maximum drawdown and the longest peak-to-recovery run in bars.
///
/// Example: equity that falls from 100 to 80 and recovers to 100 two bars later has a 20% drawdown lasting two bars.
fn max_drawdown(equity: &[EquityPoint]) -> (f64, usize) {
    let Some(first) = equity.first() else {
        return (0.0, 0);
    };
    let mut peak = first.equity;
    let mut peak_index = first.bar;
    let mut maximum = 0.0_f64;
    let mut longest_length = 0;
    let mut underwater_since = None;

    for point in equity.iter().skip(1) {
        if point.equity >= peak {
            if underwater_since.is_some() {
                longest_length = longest_length.max(point.bar.saturating_sub(peak_index));
            }
            peak = point.equity;
            peak_index = point.bar;
            underwater_since = None;
        } else if peak > 0.0 {
            underwater_since.get_or_insert(peak_index);
            maximum = maximum.max((peak - point.equity) / peak);
        }
    }
    let final_bar = equity.last().expect("first point exists").bar;
    if underwater_since.is_some() {
        longest_length = longest_length.max(final_bar.saturating_sub(peak_index));
    }
    (maximum, longest_length)
}

/// Calculates closed-trade win rate, average net profit, and profit factor.
///
/// Example: a list with no closed trades returns `None` for win rate and average trade.
fn trade_metrics(trades: &[Trade]) -> (Option<f64>, Option<f64>, Option<f64>) {
    let closed_count = trades
        .iter()
        .filter(|trade| trade.exit_bar.is_some())
        .count();
    if closed_count == 0 {
        return (None, None, None);
    }
    let mut wins = 0usize;
    let mut gross_profit = 0.0;
    let mut gross_loss = 0.0;
    let mut total_profit = 0.0;
    for trade in trades.iter().filter(|trade| trade.exit_bar.is_some()) {
        let profit = trade.net_profit.unwrap_or(0.0);
        if profit > 0.0 {
            wins += 1;
            gross_profit += profit;
        } else if profit < 0.0 {
            gross_loss += profit.abs();
        }
        total_profit += profit;
    }
    let average = total_profit / closed_count as f64;
    let factor = (gross_loss > 0.0).then_some(gross_profit / gross_loss);
    (
        Some(wins as f64 / closed_count as f64),
        Some(average),
        factor,
    )
}
