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
