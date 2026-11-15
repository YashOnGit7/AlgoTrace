// Purpose: checks null metric behavior and drawdown duration rules.
// Connects: equity/trade records to the formulas displayed in the results screen.

use algotrace_engine::costs::load_cost_preset;
use algotrace_engine::metrics::calculate_metrics;
use algotrace_engine::types::{ChargeBreakdown, EquityPoint, StrategyConfig, Trade};

/// Builds a metric configuration with fixed annualization settings.
///
/// Example: `config()` supplies the documented 6% annual risk-free rate and 252 sessions.
fn config() -> StrategyConfig {
    StrategyConfig {
        initial_capital: 100.0,
        slippage_pct: 0.0,
        cost_preset: load_cost_preset("zero_costs").unwrap(),
        force_close_at_end: false,
        risk_free_rate: 0.06,
        trading_days_per_year: 252,
    }
}

/// Checks that undefined risk and trade metrics use `None`, which serializes as JSON null.
///
/// Example: a one-point curve has fewer than two daily returns, so Sharpe and Sortino are absent.
#[test]
fn undefined_metrics_are_none_when_there_are_too_few_returns_or_no_trades() {
    let curve = [EquityPoint {
        bar: 0,
        cash: 100.0,
        shares: 0,
        equity: 100.0,
        buy_and_hold: 100.0,
    }];
    let metrics = calculate_metrics(&curve, &[], &config(), 0, 0.0).unwrap();
    assert_eq!(metrics.sharpe, None);
    assert_eq!(metrics.sortino, None);
    assert_eq!(metrics.win_rate, None);
    assert_eq!(metrics.average_net_trade, None);
    assert_eq!(metrics.profit_factor, None);
}

/// Checks Sortino is undefined when all configured-target shortfalls are zero.
#[test]
fn sortino_is_none_when_all_returns_exceed_the_daily_risk_free_target() {
    let values = [100.0, 101.0, 102.01];
    let curve: Vec<EquityPoint> = values
        .iter()
        .enumerate()
        .map(|(bar, equity)| EquityPoint {
            bar,
            cash: *equity,
            shares: 0,
            equity: *equity,
            buy_and_hold: *equity,
        })
        .collect();
    assert_eq!(
        calculate_metrics(&curve, &[], &config(), 0, 0.0)
            .unwrap()
            .sortino,
        None
    );
}

/// Checks drawdown depth and peak-to-recovery bar duration.
///
/// Example: a drop from 120 to 100 recovers at bar four, three bars after its peak at bar one.
#[test]
fn maximum_drawdown_length_runs_from_its_peak_to_its_recovery() {
    let equity_values = [100.0, 120.0, 100.0, 110.0, 120.0];
    let curve: Vec<EquityPoint> = equity_values
        .iter()
        .enumerate()
        .map(|(bar, equity)| EquityPoint {
            bar,
            cash: *equity,
            shares: 0,
            equity: *equity,
            buy_and_hold: *equity,
        })
        .collect();
    let metrics = calculate_metrics(&curve, &[], &config(), 0, 0.0).unwrap();
    assert!((metrics.max_drawdown - 1.0 / 6.0).abs() <= 1.0e-6);
    assert_eq!(metrics.max_drawdown_length, 3);
}

/// Checks reported drawdown length is the longest recovery run, independent of deepest drawdown.
#[test]
fn drawdown_length_reports_the_longest_peak_recovery_run() {
    let equity_values = [100.0, 50.0, 100.0, 120.0, 119.0, 118.0, 120.0, 121.0];
    let curve: Vec<EquityPoint> = equity_values
        .iter()
        .enumerate()
        .map(|(bar, equity)| EquityPoint {
            bar,
            cash: *equity,
            shares: 0,
            equity: *equity,
            buy_and_hold: *equity,
        })
        .collect();
    let metrics = calculate_metrics(&curve, &[], &config(), 0, 0.0).unwrap();
    assert!((metrics.max_drawdown - 0.5).abs() <= 1.0e-6);
    assert_eq!(metrics.max_drawdown_length, 3);

    let unrecovered = [100.0, 90.0, 80.0];
    let curve: Vec<EquityPoint> = unrecovered
        .iter()
        .enumerate()
        .map(|(bar, equity)| EquityPoint {
            bar,
            cash: *equity,
            shares: 0,
            equity: *equity,
            buy_and_hold: *equity,
        })
        .collect();
    let metrics = calculate_metrics(&curve, &[], &config(), 0, 0.0).unwrap();
    assert_eq!(metrics.max_drawdown_length, 2);
}

/// Checks annualized formulas use adjacent daily equity returns and configured assumptions.
///
/// Example: equity 100, 110, 99 produces daily returns +10% and -10%.
#[test]
fn return_sharpe_sortino_and_buy_hold_follow_the_documented_formulas() {
    let values = [100.0, 110.0, 99.0];
    let curve: Vec<EquityPoint> = values
        .iter()
        .enumerate()
        .map(|(bar, equity)| EquityPoint {
            bar,
            cash: *equity,
            shares: 0,
            equity: *equity,
            buy_and_hold: *equity,
        })
        .collect();
    let settings = config();
    let metrics = calculate_metrics(&curve, &[], &settings, 0, 3.5).unwrap();
    let days = settings.trading_days_per_year as f64;
    let expected_cagr = (99.0_f64 / 100.0).powf(days / 3.0) - 1.0;
    let expected_sharpe = (-(settings.risk_free_rate / days)) / 0.02_f64.sqrt() * days.sqrt();
    let target = settings.risk_free_rate / days;
    let excess = [0.1 - target, -0.1 - target];
    let expected_sortino = (excess.iter().sum::<f64>() / 2.0)
        / ((excess
            .iter()
            .map(|value| value.min(0.0).powi(2))
            .sum::<f64>()
            / 2.0)
            .sqrt())
        * days.sqrt();
    assert!((metrics.total_return - (-0.01)).abs() <= 1.0e-6);
    assert!((metrics.cagr - expected_cagr).abs() <= 1.0e-6);
    assert!((metrics.sharpe.unwrap() - expected_sharpe).abs() <= 1.0e-6);
    assert!((metrics.sortino.unwrap() - expected_sortino).abs() <= 1.0e-6);
    assert!((metrics.buy_and_hold_return - (-0.01)).abs() <= 1.0e-6);
    assert_eq!(metrics.total_charges, 3.5);
}

/// Checks metric annualization and Sortino target use a non-default 126-day configuration.
#[test]
fn configured_126_day_metrics_use_configured_risk_free_rate() {
    let values = [100.0, 102.0, 99.0, 104.0];
    let curve: Vec<EquityPoint> = values
        .iter()
        .enumerate()
        .map(|(bar, equity)| EquityPoint {
            bar,
            cash: *equity,
            shares: 0,
            equity: *equity,
            buy_and_hold: *equity,
        })
        .collect();
    let mut settings = config();
    settings.trading_days_per_year = 126;
    settings.risk_free_rate = 0.08;
    let metrics = calculate_metrics(&curve, &[], &settings, 0, 0.0).unwrap();
    let days = 126.0_f64;
    let daily_target = 0.08 / days;
    let returns = [0.02, 99.0 / 102.0 - 1.0, 104.0 / 99.0 - 1.0];
    let adjusted: Vec<_> = returns.iter().map(|value| value - daily_target).collect();
    let mean = adjusted.iter().sum::<f64>() / adjusted.len() as f64;
    let std = (adjusted
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f64>()
        / (adjusted.len() - 1) as f64)
        .sqrt();
    let downside = (adjusted
        .iter()
        .map(|value| value.min(0.0).powi(2))
        .sum::<f64>()
        / adjusted.len() as f64)
        .sqrt();
    let expected_cagr = (104.0_f64 / 100.0).powf(days / 4.0) - 1.0;
    let expected_sharpe = mean / std * days.sqrt();
    let expected_sortino = mean / downside * days.sqrt();
    assert!((metrics.cagr - expected_cagr).abs() <= 1.0e-6);
    assert!((metrics.sharpe.unwrap() - expected_sharpe).abs() <= 1.0e-6);
    assert!((metrics.sortino.unwrap() - expected_sortino).abs() <= 1.0e-6);
}

/// Checks trade count, win rate, average net trade, and profit factor ignore open trades.
///
/// Example: one +10 closed trade and one -5 closed trade have a factor of 2.0.
#[test]
fn trade_metrics_use_only_closed_trades_and_net_profit() {
    let closed_trade = |profit| Trade {
        entry_bar: 0,
        exit_bar: Some(1),
        shares: 1,
        entry_price: 100.0,
        exit_price: Some(100.0 + profit),
        exit_reason: None,
        entry_charges: ChargeBreakdown::default(),
        exit_charges: Some(ChargeBreakdown::default()),
        net_profit: Some(profit),
    };
    let mut open_trade = closed_trade(100.0);
    open_trade.exit_bar = None;
    open_trade.net_profit = None;
    let curve = [EquityPoint {
        bar: 0,
        cash: 100.0,
        shares: 0,
        equity: 100.0,
        buy_and_hold: 100.0,
    }];
    let trades = [closed_trade(10.0), closed_trade(-5.0), open_trade];
    let metrics = calculate_metrics(&curve, &trades, &config(), 0, 0.0).unwrap();
    assert_eq!(metrics.trade_count, 2);
    assert_eq!(metrics.win_rate, Some(0.5));
    assert_eq!(metrics.average_net_trade, Some(2.5));
    assert_eq!(metrics.profit_factor, Some(2.0));
}
