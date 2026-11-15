// Purpose: verifies borrowed binary reads, invalid-bar rejection, DELAY, and no-look-ahead behavior.
// Connects: AGT1 validation and AST evaluation to the specification's timing guarantee.

mod common;

use std::collections::BTreeMap;

use algotrace_engine::data::read_price_file;
use algotrace_engine::evaluator::{EvaluationPlan, EvaluationWorkspace};
use algotrace_engine::simulator::run_backtest;
use algotrace_engine::types::{AstNode, CostPreset, NodeOp, StrategyAst, StrategyConfig};
use serde_json::json;

/// Encodes the checked-in crossover fixture into AGT1 bytes for timing comparisons.
///
/// Example: `crossover_bytes()` produces the exact twenty-bar test path.
fn crossover_bytes() -> Vec<u8> {
    let rows = common::read_csv_rows(include_str!("fixtures/crossover_20.csv")).unwrap();
    let bars: Vec<[f64; 6]> = rows
        .iter()
        .map(|row| [row[0], row[1], row[2], row[3], row[4], row[5]])
        .collect();
    common::encode_rows(&bars)
}

/// Builds a small AST whose entry is a delayed close greater than two.
///
/// Example: DELAY(1) starts false and first compares the prior bar's close on bar one.
fn delayed_close_ast() -> StrategyAst {
    StrategyAst {
        version: 1,
        config: StrategyConfig {
            initial_capital: 1_000.0,
            slippage_pct: 0.0,
            cost_preset: CostPreset::default(),
            force_close_at_end: false,
            risk_free_rate: 0.06,
            trading_days_per_year: 252,
        },
        nodes: vec![
            AstNode {
                id: "close".into(),
                op: NodeOp::Price,
                params: BTreeMap::from([("field".into(), json!("close"))]),
                inputs: BTreeMap::new(),
            },
            AstNode {
                id: "delayed".into(),
                op: NodeOp::Delay,
                params: BTreeMap::from([("bars".into(), json!(1))]),
                inputs: BTreeMap::from([("input".into(), "close".into())]),
            },
            AstNode {
                id: "two".into(),
                op: NodeOp::Constant,
                params: BTreeMap::from([("value".into(), json!(2.0))]),
                inputs: BTreeMap::new(),
            },
            AstNode {
                id: "entry".into(),
                op: NodeOp::Gt,
                params: BTreeMap::new(),
                inputs: BTreeMap::from([
                    ("a".into(), "delayed".into()),
                    ("b".into(), "two".into()),
                ]),
            },
            AstNode {
                id: "exit".into(),
                op: NodeOp::Not,
                params: BTreeMap::new(),
                inputs: BTreeMap::from([("input".into(), "entry".into())]),
            },
            AstNode {
                id: "strategy".into(),
                op: NodeOp::Strategy,
                params: BTreeMap::new(),
                inputs: BTreeMap::from([
                    ("entry".into(), "entry".into()),
                    ("exit".into(), "exit".into()),
                ]),
            },
        ],
        sink: "strategy".into(),
    }
}

/// Checks that parsed views keep the caller's original byte pointer.
///
/// Example: `read_price_file` borrows bytes rather than decoding six copied vectors.
#[test]
fn price_view_borrows_the_original_binary_without_copying_arrays() {
    let bytes = common::encode_rows(&[[1.0, 10.0, 11.0, 9.0, 10.0, 100.0]]);
    let view = read_price_file(&bytes).unwrap();
    assert_eq!(view.backing_bytes().as_ptr(), bytes.as_ptr());
    assert_eq!(
        view.value(algotrace_engine::types::PriceField::Close, 0)
            .unwrap(),
        10.0
    );
}

/// Checks that a structurally impossible OHLC bar is rejected before evaluation.
///
/// Example: a close above the bar high is an invalid daily price row.
#[test]
fn price_reader_rejects_high_below_low() {
    let invalid = common::encode_rows(&[[1.0, 10.0, 9.0, 11.0, 10.0, 100.0]]);
    assert!(read_price_file(&invalid).is_err());
}

/// Checks invalid timestamps, NaNs, and volume values are rejected before evaluation.
#[test]
fn price_reader_rejects_nan_and_non_increasing_timestamps_but_allows_zero_volume() {
    let valid_zero_volume = common::encode_rows(&[
        [1.0, 10.0, 11.0, 9.0, 10.0, 0.0],
        [2.0, 10.0, 11.0, 9.0, 10.0, 0.0],
    ]);
    assert!(read_price_file(&valid_zero_volume).is_ok());

    let repeated_timestamps = common::encode_rows(&[
        [1.0, 10.0, 11.0, 9.0, 10.0, 0.0],
        [1.0, 10.0, 11.0, 9.0, 10.0, 0.0],
    ]);
    assert!(read_price_file(&repeated_timestamps).is_err());

    let nan_timestamp = common::encode_rows(&[[f64::NAN, 10.0, 11.0, 9.0, 10.0, 0.0]]);
    assert!(read_price_file(&nan_timestamp).is_err());

    let nan_volume = common::encode_rows(&[[1.0, 10.0, 11.0, 9.0, 10.0, f64::NAN]]);
    assert!(read_price_file(&nan_volume).is_err());

    let non_positive_price = common::encode_rows(&[[1.0, 0.0, 11.0, 0.0, 10.0, 0.0]]);
    assert!(read_price_file(&non_positive_price).is_err());

    let nan_price = common::encode_rows(&[[1.0, f64::NAN, 11.0, 9.0, 10.0, 0.0]]);
    assert!(read_price_file(&nan_price).is_err());

    let infinite_price = common::encode_rows(&[[1.0, 10.0, f64::INFINITY, 9.0, 10.0, 0.0]]);
    assert!(read_price_file(&infinite_price).is_err());

    let negative_volume = common::encode_rows(&[[1.0, 10.0, 11.0, 9.0, 10.0, -1.0]]);
    assert!(read_price_file(&negative_volume).is_err());
}

/// Checks that DELAY writes false during its first bar and shifts values later.
///
/// Example: a close of 3 at bar zero becomes the delayed value at bar one.
#[test]
fn delay_outputs_false_for_its_warm_up_bar_then_uses_the_prior_value() {
    let rows = [
        [1.0, 3.0, 4.0, 2.0, 3.0, 100.0],
        [2.0, 1.0, 2.0, 1.0, 1.0, 100.0],
    ];
    let bytes = common::encode_rows(&rows);
    let view = common::price_view(&bytes);
    let plan = EvaluationPlan::new(&delayed_close_ast()).unwrap();
    let mut workspace = EvaluationWorkspace::default();
    let signals = plan.evaluate(view, &mut workspace).unwrap();
    assert!(!signals.entry[0]);
    assert!(signals.entry[1]);
    assert!(!signals.exit[1]);
}

/// Checks that future-price changes cannot alter earlier signals, orders, or equity values.
///
/// Example: changing bars eleven onward leaves every signal and equity value through bar ten unchanged.
#[test]
fn changing_future_prices_does_not_change_signals_orders_or_equity_through_bar_ten() {
    let original = crossover_bytes();
    let original_rows = common::read_csv_rows(include_str!("fixtures/crossover_20.csv")).unwrap();
    let mut changed_rows = original_rows;
    for (index, row) in changed_rows.iter_mut().enumerate().skip(11) {
        row[4] += 2.0 + index as f64;
        row[2] = row[1].max(row[4]) + 1.0;
        row[3] = row[1].min(row[4]) - 1.0;
    }
    let changed_bars: Vec<[f64; 6]> = changed_rows
        .iter()
        .map(|row| [row[0], row[1], row[2], row[3], row[4], row[5]])
        .collect();
    let changed = common::encode_rows(&changed_bars);
    let ast = common::crossover_ast(
        0.0,
        algotrace_engine::costs::load_cost_preset("zero_costs").unwrap(),
    );

    let plan = EvaluationPlan::new(&ast).unwrap();
    let mut first_workspace = EvaluationWorkspace::default();
    let first_signals = plan
        .evaluate(common::price_view(&original), &mut first_workspace)
        .unwrap();
    let first_entry = first_signals.entry[..=10].to_vec();
    let first_exit = first_signals.exit[..=10].to_vec();
    let baseline = run_backtest(&ast, common::price_view(&original)).unwrap();
    let changed_result = run_backtest(&ast, common::price_view(&changed)).unwrap();
    let changed_signals = plan
        .evaluate(common::price_view(&changed), &mut first_workspace)
        .unwrap();

    assert_eq!(first_entry, changed_signals.entry[..=10]);
    assert_eq!(first_exit, changed_signals.exit[..=10]);
    for (left, right) in baseline.equity_curve[..=10]
        .iter()
        .zip(&changed_result.equity_curve[..=10])
    {
        assert_eq!(left, right);
    }
    let baseline_early_entries: Vec<_> = baseline
        .trades
        .iter()
        .filter(|trade| trade.entry_bar <= 10)
        .collect();
    let changed_early_entries: Vec<_> = changed_result
        .trades
        .iter()
        .filter(|trade| trade.entry_bar <= 10)
        .collect();
    assert_eq!(baseline_early_entries.len(), changed_early_entries.len());
    for (left, right) in baseline_early_entries.iter().zip(changed_early_entries) {
        assert_eq!(left.entry_bar, right.entry_bar);
        assert_eq!(left.shares, right.shares);
        assert_eq!(left.entry_price, right.entry_price);
    }
}
