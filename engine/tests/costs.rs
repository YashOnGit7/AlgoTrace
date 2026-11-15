// Purpose: verifies per-fill charge arithmetic and sell-only DP fees.
// Connects: the dated cost preset to the simulator's charge breakdown.

use algotrace_engine::costs::{calculate_charges, load_cost_preset, FillSide};

/// Checks the one-lakh buy and one-lakh sell example from the specification.
///
/// Example: the combined charges match Rs 237.8212 within one paisa tolerance.
#[test]
fn zerodha_delivery_costs_match_the_specified_charge_example() {
    let preset = load_cost_preset("zerodha_equity_delivery").unwrap();
    let buy = calculate_charges(&preset, FillSide::Buy, 100_000.0).unwrap();
    let sell = calculate_charges(&preset, FillSide::Sell, 100_000.0).unwrap();
    assert!((buy.stt + sell.stt - 200.0).abs() < 0.01);
    assert!((buy.stamp_duty - 15.0).abs() < 0.01);
    assert!((buy.transaction + sell.transaction - 6.14).abs() < 0.01);
    assert!((buy.sebi + sell.sebi - 0.20).abs() < 0.01);
    assert!((buy.gst + sell.gst - 1.1412).abs() < 0.01);
    assert!((sell.dp - 15.34).abs() < 0.01);
    assert!((buy.total() + sell.total() - 237.8212).abs() < 0.01);
}

/// Checks that the DP flat charge applies to each sell order and never to a buy.
///
/// Example: a buy breakdown has zero DP while a sell breakdown has Rs 15.34 DP.
#[test]
fn dp_charge_applies_only_to_sells() {
    let preset = load_cost_preset("zerodha_equity_delivery").unwrap();
    let buy = calculate_charges(&preset, FillSide::Buy, 10_000.0).unwrap();
    let sell = calculate_charges(&preset, FillSide::Sell, 10_000.0).unwrap();
    assert_eq!(buy.dp, 0.0);
    assert_eq!(sell.dp, 15.34);
}

/// Checks supplied cost presets reject non-finite and negative rates with a clear error.
#[test]
fn supplied_cost_preset_must_have_finite_non_negative_values() {
    let mut negative = load_cost_preset("zero_costs").unwrap();
    negative.brokerage_flat = -0.01;
    let error = algotrace_engine::costs::calculate_charges(
        &negative,
        algotrace_engine::costs::FillSide::Buy,
        100.0,
    )
    .unwrap_err();
    assert!(error.to_string().contains("finite and non-negative"));

    let mut not_finite = load_cost_preset("zero_costs").unwrap();
    not_finite.stt_sell_pct = f64::INFINITY;
    let error = algotrace_engine::costs::calculate_charges(
        &not_finite,
        algotrace_engine::costs::FillSide::Sell,
        100.0,
    )
    .unwrap_err();
    assert!(error.to_string().contains("finite and non-negative"));
}
