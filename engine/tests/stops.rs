// Purpose: checks stop-loss, gap, take-profit, and same-bar priority fills.
// Connects: OHLC intrabar rules to simulator exits and per-trade reasons.

mod common;

use algotrace_engine::costs::load_cost_preset;
use algotrace_engine::evaluator::StrategyParameters;
use algotrace_engine::simulator::{simulate_into, SimulationWorkspace};
use algotrace_engine::types::{ExitReason, StrategyConfig};

/// Runs a one-entry stop/target fixture and returns its only trade.
///
/// Example: a bar with low below the stop returns a `StopLoss` trade.
fn run_protective_exit(
    second_bar: [f64; 6],
    stop: Option<f64>,
    target: Option<f64>,
) -> algotrace_engine::types::Trade {
    let rows = [
        [1.0, 100.0, 101.0, 99.0, 100.0, 100.0],
        [2.0, 100.0, 102.0, 99.0, 101.0, 100.0],
        second_bar,
    ];
    let bytes = common::encode_rows(&rows);
    let prices = common::price_view(&bytes);
    let config = StrategyConfig {
        initial_capital: 1_000.0,
        slippage_pct: 0.05,
        cost_preset: load_cost_preset("zero_costs").unwrap(),
        force_close_at_end: false,
        risk_free_rate: 0.06,
        trading_days_per_year: 252,
    };
    let parameters = StrategyParameters {
        position_size_pct: 100.0,
        stop_loss_pct: stop,
        take_profit_pct: target,
    };
    let mut entry = [false; 3];
    entry[0] = true;
    let exit = [false; 3];
    let mut workspace = SimulationWorkspace::default();
    simulate_into(prices, &entry, &exit, &config, parameters, &mut workspace).unwrap();
    workspace.result().trades[0].clone()
}

/// Checks a stop touched during the session applies sell slippage to its stop price.
///
/// Example: a low of 89 crosses the approximately Rs 90.045 stop.
#[test]
fn stop_loss_applies_sell_slippage_to_a_normal_stop_fill() {
    let trade = run_protective_exit([3.0, 100.0, 105.0, 89.0, 95.0, 100.0], Some(10.0), None);
    assert_eq!(trade.exit_reason, Some(ExitReason::StopLoss));
    assert!((trade.exit_price.unwrap() - trade.entry_price * 0.9 * 0.9995).abs() <= 1.0e-6);
}

/// Checks a gap below the stop fills at that day's open with sell slippage.
///
/// Example: with a stop near 90 and an open of 80, sell slippage applies to the open.
#[test]
fn stop_loss_gap_down_fills_at_the_open() {
    let trade = run_protective_exit([3.0, 80.0, 85.0, 78.0, 82.0, 100.0], Some(10.0), None);
    assert_eq!(trade.exit_reason, Some(ExitReason::StopLoss));
    assert!((trade.exit_price.unwrap() - 80.0 * 0.9995).abs() <= 1.0e-6);
}

/// Checks a take-profit trigger fills at its target without additional slippage.
///
/// Example: a high above 110 fills at the target calculated from the entry fill.
#[test]
fn take_profit_fills_at_its_target_price() {
    let trade = run_protective_exit([3.0, 100.0, 112.0, 95.0, 108.0, 100.0], None, Some(10.0));
    assert_eq!(trade.exit_reason, Some(ExitReason::TakeProfit));
    assert!((trade.exit_price.unwrap() - trade.entry_price * 1.1).abs() <= 1.0e-6);
}

/// Checks a bar that touches both protective prices resolves in favor of the stop.
///
/// Example: both low 89 and high 112 in one bar still return `StopLoss`.
#[test]
fn stop_loss_wins_when_stop_and_target_both_trigger_in_one_bar() {
    let trade = run_protective_exit(
        [3.0, 100.0, 112.0, 89.0, 100.0, 100.0],
        Some(10.0),
        Some(10.0),
    );
    assert_eq!(trade.exit_reason, Some(ExitReason::StopLoss));
    assert!((trade.exit_price.unwrap() - trade.entry_price * 0.9 * 0.9995).abs() <= 1.0e-6);
}

/// Checks a favorable gap through a take-profit receives the open price without slippage.
#[test]
fn take_profit_gap_fills_at_the_open_without_slippage() {
    let trade = run_protective_exit([3.0, 115.0, 118.0, 112.0, 116.0, 100.0], None, Some(10.0));
    assert_eq!(trade.exit_reason, Some(ExitReason::TakeProfit));
    assert_eq!(trade.exit_price, Some(115.0));
}
