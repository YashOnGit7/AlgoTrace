// Purpose: checks parameter sweeps reuse one prepared graph and return a summary per value.
// Connects: evaluation and simulation workspaces to heatmap-ready metric points.

mod common;

use algotrace_engine::costs::load_cost_preset;
use algotrace_engine::simulator::run_backtest;
use algotrace_engine::sweep::{run_sweep, SweepParameter};

/// Converts the worked fixture to its borrowed price view.
///
/// Example: `fixture_bytes()` returns the twenty daily bars used by the crossover tests.
fn fixture_bytes() -> Vec<u8> {
    let rows = common::read_csv_rows(include_str!("fixtures/crossover_20.csv")).unwrap();
    let bars: Vec<[f64; 6]> = rows
        .iter()
        .map(|row| [row[0], row[1], row[2], row[3], row[4], row[5]])
        .collect();
    common::encode_rows(&bars)
}

/// Checks that each sweep value produces metrics and the first result matches a normal run.
///
/// Example: a period-two first point matches the same AST run without a sweep.
#[test]
fn sweep_returns_a_metric_summary_for_every_parameter_value() {
    let bytes = fixture_bytes();
    let prices = common::price_view(&bytes);
    let ast = common::crossover_ast(0.0, load_cost_preset("zero_costs").unwrap());
    let parameter = SweepParameter {
        node_id: "fast".into(),
        name: "period".into(),
        values: vec![2.0, 3.0],
    };
    let points = run_sweep(&ast, prices, &parameter).unwrap();
    assert_eq!(points.len(), 2);
    let normal = run_backtest(&ast, prices).unwrap();
    assert_eq!(points[0].metrics, normal.metrics);
}
