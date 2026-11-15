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
    let expected_cagr = (99.0_f64 / 100.0).powf(252.0 / 3.0) - 1.0;
    let expected_sharpe = (-(settings.risk_free_rate / 252.0)) / 0.02_f64.sqrt() * 252.0_f64.sqrt();
    assert!((metrics.total_return - (-0.01)).abs() <= 1.0e-6);
    assert!((metrics.cagr - expected_cagr).abs() <= 1.0e-6);
    assert!((metrics.sharpe.unwrap() - expected_sharpe).abs() <= 1.0e-6);
    assert!(metrics.sortino.unwrap().abs() <= 1.0e-6);
    assert!((metrics.buy_and_hold_return - (-0.01)).abs() <= 1.0e-6);
    assert_eq!(metrics.total_charges, 3.5);
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
