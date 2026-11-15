// Purpose: verifies final-bar signals cannot create impossible next-bar orders.
// Connects: signal timing to simulator end-of-data behavior.

mod common;

use algotrace_engine::costs::load_cost_preset;
use algotrace_engine::evaluator::StrategyParameters;
use algotrace_engine::simulator::{simulate_into, SimulationWorkspace};
use algotrace_engine::types::{ExitReason, StrategyConfig};

/// Checks that an entry signal on the final bar does not open a position.
///
/// Example: `[false, true]` over two bars has no following open for the last signal.
#[test]
fn final_bar_entry_signal_creates_no_order() {
    let bars = [
        [1.0, 10.0, 11.0, 9.0, 10.0, 100.0],
        [2.0, 11.0, 12.0, 10.0, 11.0, 100.0],
    ];
    let bytes = common::encode_rows(&bars);
    let prices = common::price_view(&bytes);
    let config = StrategyConfig {
        initial_capital: 1_000.0,
        slippage_pct: 0.0,
        cost_preset: load_cost_preset("zero_costs").unwrap(),
        force_close_at_end: false,
        risk_free_rate: 0.06,
        trading_days_per_year: 252,
    };
    let mut workspace = SimulationWorkspace::default();
    simulate_into(
        prices,
        &[false, true],
        &[false, false],
        &config,
        StrategyParameters {
            position_size_pct: 100.0,
            stop_loss_pct: None,
            take_profit_pct: None,
        },
        &mut workspace,
    )
    .unwrap();
    assert!(workspace.result().trades.is_empty());
}

/// Checks that an unforced final position remains visible but is not counted as a closed trade.
///
/// Example: `force_close_at_end: false` leaves `exit_bar` empty and trade count zero.
#[test]
fn unforced_end_of_data_marks_the_open_position_without_counting_a_closed_trade() {
    let bars = [
        [1.0, 10.0, 11.0, 9.0, 10.0, 100.0],
        [2.0, 11.0, 12.0, 10.0, 11.0, 100.0],
    ];
    let bytes = common::encode_rows(&bars);
    let prices = common::price_view(&bytes);
    let config = StrategyConfig {
        initial_capital: 1_000.0,
        slippage_pct: 0.05,
        cost_preset: load_cost_preset("zero_costs").unwrap(),
        force_close_at_end: false,
        risk_free_rate: 0.06,
        trading_days_per_year: 252,
    };
    let mut workspace = SimulationWorkspace::default();
    simulate_into(
        prices,
        &[true, false],
        &[false, false],
        &config,
        StrategyParameters {
            position_size_pct: 100.0,
            stop_loss_pct: None,
            take_profit_pct: None,
        },
        &mut workspace,
    )
    .unwrap();
    let result = workspace.result();
    assert_eq!(result.trades.len(), 1);
    assert_eq!(result.trades[0].exit_bar, None);
    assert_eq!(result.metrics.trade_count, 0);
    assert_eq!(result.metrics.win_rate, None);
    assert_eq!(result.metrics.profit_factor, None);
}

/// Checks that forced end-of-data closure sells at the final close after normal sell slippage.
///
/// Example: final close 11 with 0.05% slippage exits at `11 * 0.9995`.
#[test]
fn forced_end_of_data_closes_at_the_slipped_final_close() {
    let bars = [
        [1.0, 10.0, 11.0, 9.0, 10.0, 100.0],
        [2.0, 11.0, 12.0, 10.0, 11.0, 100.0],
    ];
    let bytes = common::encode_rows(&bars);
    let prices = common::price_view(&bytes);
    let config = StrategyConfig {
        initial_capital: 1_000.0,
        slippage_pct: 0.05,
        cost_preset: load_cost_preset("zero_costs").unwrap(),
        force_close_at_end: true,
        risk_free_rate: 0.06,
        trading_days_per_year: 252,
    };
    let mut workspace = SimulationWorkspace::default();
    simulate_into(
        prices,
        &[true, false],
        &[false, false],
        &config,
        StrategyParameters {
            position_size_pct: 100.0,
            stop_loss_pct: None,
            take_profit_pct: None,
        },
        &mut workspace,
    )
    .unwrap();
    let trade = &workspace.result().trades[0];
    assert_eq!(trade.exit_bar, Some(1));
    assert_eq!(trade.exit_reason, Some(ExitReason::EndOfData));
    assert!((trade.exit_price.unwrap() - 11.0 * 0.9995).abs() <= 1.0e-6);
}

/// Checks simultaneous entry and exit signals while flat do not create an order.
///
/// Example: both booleans true at bar zero leave the next bar flat.
#[test]
fn entry_and_exit_signals_both_true_while_flat_do_nothing() {
    let bars = [
        [1.0, 10.0, 11.0, 9.0, 10.0, 100.0],
        [2.0, 11.0, 12.0, 10.0, 11.0, 100.0],
    ];
    let bytes = common::encode_rows(&bars);
    let prices = common::price_view(&bytes);
    let config = StrategyConfig {
        initial_capital: 1_000.0,
        slippage_pct: 0.0,
        cost_preset: load_cost_preset("zero_costs").unwrap(),
        force_close_at_end: false,
        risk_free_rate: 0.06,
        trading_days_per_year: 252,
    };
    let mut workspace = SimulationWorkspace::default();
    simulate_into(
        prices,
        &[true, false],
        &[true, false],
        &config,
        StrategyParameters {
            position_size_pct: 100.0,
            stop_loss_pct: None,
            take_profit_pct: None,
        },
        &mut workspace,
    )
    .unwrap();
    assert!(workspace.result().trades.is_empty());
}

/// Checks that a sell fee shortfall returns an error before cash is recorded below zero.
///
/// Example: a steep price drop can make the fixed DP fee exceed both sale proceeds and cash.
#[test]
fn sell_charge_shortfall_rejects_the_run_before_cash_becomes_negative() {
    let bars = [
        [1.0, 500.0, 501.0, 499.0, 500.0, 100.0],
        [2.0, 500.0, 501.0, 499.0, 500.0, 100.0],
        [3.0, 1.0, 2.0, 0.5, 1.0, 100.0],
    ];
    let bytes = common::encode_rows(&bars);
    let prices = common::price_view(&bytes);
    let config = StrategyConfig {
        initial_capital: 501.2,
        slippage_pct: 0.0,
        cost_preset: load_cost_preset("zerodha_equity_delivery").unwrap(),
        force_close_at_end: false,
        risk_free_rate: 0.06,
        trading_days_per_year: 252,
    };
    let mut workspace = SimulationWorkspace::default();
    let result = simulate_into(
        prices,
        &[true, false, false],
        &[false, true, false],
        &config,
        StrategyParameters {
            position_size_pct: 100.0,
            stop_loss_pct: None,
            take_profit_pct: None,
        },
        &mut workspace,
    );
    assert!(result.is_err());
}
