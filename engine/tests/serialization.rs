// Purpose: checks AST JSON field ordering required by the shared AST format.
// Connects: Rust engine types to the compiler's canonical JSON contract.

mod common;

/// Checks top-level, config, node, and cost preset struct key order is deterministic.
#[test]
fn ast_serialization_uses_the_specified_field_orders() {
    let ast = common::crossover_ast(0.05, algotrace_engine::types::CostPreset::default());
    let json = serde_json::to_string(&ast).unwrap();
    let top_level = ["\"version\"", "\"config\"", "\"nodes\"", "\"sink\""];
    let config = [
        "\"cost_preset\"",
        "\"force_close_at_end\"",
        "\"initial_capital\"",
        "\"risk_free_rate\"",
        "\"slippage_pct\"",
        "\"trading_days_per_year\"",
    ];
    let cost = [
        "\"brokerage_flat\"",
        "\"brokerage_max_per_order\"",
        "\"brokerage_pct\"",
        "\"dp_sell_flat\"",
        "\"gst_pct\"",
        "\"sebi_pct\"",
        "\"stamp_buy_pct\"",
        "\"stt_buy_pct\"",
        "\"stt_sell_pct\"",
        "\"txn_pct\"",
    ];
    assert_ordered(&json, &top_level);
    assert_ordered(&json, &config);
    assert_ordered(&json, &cost);
    let node_start = json.find("\"id\":\"close\"").unwrap();
    assert_ordered(
        &json[node_start..],
        &[
            "\"id\":\"close\"",
            "\"op\":\"PRICE\"",
            "\"params\"",
            "\"inputs\"",
        ],
    );
}

fn assert_ordered(json: &str, keys: &[&str]) {
    let mut previous = 0;
    for key in keys {
        let index = json[previous..].find(key).unwrap() + previous;
        assert!(index >= previous, "key {key} was out of order");
        previous = index + key.len();
    }
}
