// Purpose: locks down scheduled-open exit priority over same-bar stop fills.
// Connects: G15 event ordering to exact trade, cash, and equity results.

mod common;

use algotrace_engine::costs::load_cost_preset;
use algotrace_engine::evaluator::StrategyParameters;
use algotrace_engine::simulator::{simulate_into, SimulationWorkspace};
use algotrace_engine::types::{ExitReason, StrategyConfig};

/// Runs one buy followed by a scheduled signal exit on a stop-triggering bar.
///
/// Example: an open below the 10% stop still exits as `Signal` when a sell was scheduled.
fn run_scheduled_exit_on_stop_bar(exit_bar: [f64; 6]) -> SimulationWorkspace {
    let rows = [
        [1.0, 100.0, 101.0, 99.0, 100.0, 10.0],
        [2.0, 100.0, 102.0, 95.0, 100.0, 10.0],
        exit_bar,
    ];
    let bytes = common::encode_rows(&rows);
    let prices = common::price_view(&bytes);
    let config = StrategyConfig {
        initial_capital: 1_000.0,
        slippage_pct: 1.0,
        cost_preset: load_cost_preset("zero_costs").unwrap(),
        force_close_at_end: false,
        risk_free_rate: 0.06,
        trading_days_per_year: 252,
    };
    let parameters = StrategyParameters {
        position_size_pct: 100.0,
        stop_loss_pct: Some(10.0),
        take_profit_pct: None,
    };
    let entry = [true, false, false];
    let exit = [false, true, false];
    let mut workspace = SimulationWorkspace::default();
    simulate_into(prices, &entry, &exit, &config, parameters, &mut workspace).unwrap();
    workspace
}

/// Checks that an intrabar stop does not override a signal exit already due at the open.
///
/// Example: the signal sells nine shares at `95 x 0.99 = 94.05`, before the later low hits the stop.
#[test]
fn scheduled_signal_exit_wins_when_intrabar_stop_triggers_after_the_open() {
    let workspace = run_scheduled_exit_on_stop_bar([3.0, 95.0, 96.0, 85.0, 92.0, 10.0]);
    let result = workspace.result();
    let trade = &result.trades[0];

    assert_eq!(result.trades.len(), 1);
    assert_eq!(trade.entry_bar, 1);
    assert_eq!(trade.exit_bar, Some(2));
    assert_eq!(trade.shares, 9);
    assert_eq!(trade.entry_price, 101.0);
    assert_eq!(trade.exit_reason, Some(ExitReason::Signal));
    assert!((trade.exit_price.unwrap() - 94.05).abs() < 1.0e-10);
    assert!((trade.net_profit.unwrap() - (-62.55)).abs() < 1.0e-10);
    assert_eq!(result.equity_curve[0].equity, 1_000.0);
    assert_eq!(result.equity_curve[1].cash, 91.0);
    assert_eq!(result.equity_curve[1].shares, 9);
    assert!((result.equity_curve[2].equity - 937.45).abs() < 1.0e-10);
}

/// Checks an already-scheduled signal exit remains the reason when the open gaps below the stop.
///
/// Example: the order sells nine shares at `80 x 0.99 = 79.2` and records `Signal`, not `StopLoss`.
#[test]
fn scheduled_signal_exit_wins_when_the_open_gaps_below_the_stop() {
    let workspace = run_scheduled_exit_on_stop_bar([3.0, 80.0, 90.0, 75.0, 82.0, 10.0]);
    let result = workspace.result();
    let trade = &result.trades[0];

    assert_eq!(result.trades.len(), 1);
    assert_eq!(trade.entry_bar, 1);
    assert_eq!(trade.exit_bar, Some(2));
    assert_eq!(trade.shares, 9);
    assert_eq!(trade.entry_price, 101.0);
    assert_eq!(trade.exit_reason, Some(ExitReason::Signal));
    assert!((trade.exit_price.unwrap() - 79.2).abs() < 1.0e-10);
    assert!((trade.net_profit.unwrap() - (-196.2)).abs() < 1.0e-10);
    assert_eq!(result.equity_curve[0].equity, 1_000.0);
    assert_eq!(result.equity_curve[1].cash, 91.0);
    assert_eq!(result.equity_curve[1].shares, 9);
    assert!((result.equity_curve[2].equity - 803.8).abs() < 1.0e-10);
}
