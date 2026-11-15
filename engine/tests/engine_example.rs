// Purpose: verifies the 20-bar moving-average crossover with hand-computed fills and equity.
// Connects: indicator evaluation, next-open execution, whole shares, and results metrics.

mod common;

use algotrace_engine::costs::load_cost_preset;
use algotrace_engine::evaluator::{EvaluationPlan, EvaluationWorkspace};
use algotrace_engine::simulator::run_backtest;

/// Converts the 20-bar worked fixture to column-major AGT1 bytes.
///
/// Example: the returned view has twenty bars and the specified open at index seven.
fn crossover_fixture_bytes() -> Vec<u8> {
    let rows = common::read_csv_rows(include_str!("fixtures/crossover_20.csv")).unwrap();
    let bars: Vec<[f64; 6]> = rows
        .iter()
        .map(|row| [row[0], row[1], row[2], row[3], row[4], row[5]])
        .collect();
    common::encode_rows(&bars)
}

/// Checks the moving-average signals occur on bars six and twelve and fill one bar later.
///
/// Example: a cross above at close six buys at the open of bar seven.
#[test]
fn moving_average_crossovers_signal_at_close_and_fill_on_the_next_open() {
    let bytes = crossover_fixture_bytes();
    let prices = common::price_view(&bytes);
    let ast = common::crossover_ast(0.0, load_cost_preset("zero_costs").unwrap());
    let plan = EvaluationPlan::new(&ast).unwrap();
    let mut workspace = EvaluationWorkspace::default();
    let signals = plan.evaluate(prices, &mut workspace).unwrap();
    assert!(signals.entry[6]);
    assert!(signals.exit[12]);
    assert!(!signals.entry[7]);
}

/// Checks the one-trade worked example and every daily equity value.
///
/// Example: 125 shares bought at Rs 8 and sold at Rs 10 yield Rs 1,250 final cash.
#[test]
fn twenty_bar_crossover_matches_hand_computed_trade_and_equity() {
    let bytes = crossover_fixture_bytes();
    let prices = common::price_view(&bytes);
    let ast = common::crossover_ast(0.0, load_cost_preset("zero_costs").unwrap());
    let result = run_backtest(&ast, prices).unwrap();
    assert_eq!(result.trades.len(), 1);
    let trade = &result.trades[0];
    assert_eq!(trade.entry_bar, 7);
    assert_eq!(trade.exit_bar, Some(13));
    assert_eq!(trade.shares, 125);
    assert_eq!(trade.entry_price, 8.0);
    assert_eq!(trade.exit_price, Some(10.0));
    assert_eq!(trade.net_profit, Some(250.0));

    let expected = [
        1_000.0, 1_000.0, 1_000.0, 1_000.0, 1_000.0, 1_000.0, 1_000.0, 1_125.0, 1_250.0, 1_375.0,
        1_500.0, 1_375.0, 1_250.0, 1_250.0, 1_250.0, 1_250.0, 1_250.0, 1_250.0, 1_250.0, 1_250.0,
    ];
    let actual: Vec<f64> = result
        .equity_curve
        .iter()
        .map(|point| point.equity)
        .collect();
    assert_eq!(actual, expected);
    assert_eq!(result.metrics.trade_count, 1);
    assert_eq!(result.metrics.win_rate, Some(1.0));
}
