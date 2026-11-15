//! Purpose: shares fixture readers and AST builders among engine integration tests.
//! Connects: readable CSV data to AGT1 bytes and validated evaluator inputs.

// Each integration test imports only the helpers it needs, so allow the rest to remain shared here.
#![allow(dead_code)]

use std::collections::BTreeMap;

use algotrace_engine::data::read_price_file;
use algotrace_engine::types::{AstNode, CostPreset, PriceView, StrategyAst, StrategyConfig};
use serde_json::json;

/// Encodes rows of `[timestamp, open, high, low, close, volume]` into the AGT1 layout.
///
/// Example: `encode_rows(&[[1.0, 10.0, 11.0, 9.0, 10.0, 100.0]])` creates one valid bar.
pub fn encode_rows(rows: &[[f64; 6]]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(16 + rows.len() * 6 * 8);
    bytes.extend_from_slice(b"AGT1");
    bytes.extend_from_slice(&(rows.len() as u32).to_le_bytes());
    bytes.extend_from_slice(&[0; 8]);
    for column in 0..6 {
        for row in rows {
            bytes.extend_from_slice(&row[column].to_le_bytes());
        }
    }
    bytes
}

/// Reads numeric rows from one commented CSV fixture.
///
/// Example: `read_csv_rows(include_str!("../fixtures/crossover_20.csv"))?` returns twenty rows.
pub fn read_csv_rows(contents: &str) -> Result<Vec<Vec<f64>>, String> {
    contents
        .lines()
        .filter(|line| !line.starts_with('#') && !line.trim().is_empty())
        .skip(1)
        .map(|line| {
            line.split(',')
                .map(|field| {
                    field
                        .parse::<f64>()
                        .map_err(|error| format!("invalid fixture number {field}: {error}"))
                })
                .collect()
        })
        .collect()
}

/// Builds the SMA(2)-against-SMA(3) crossover AST used by worked examples.
///
/// Example: `crossover_ast(0.0, CostPreset::default())` creates a zero-fee hand-checkable strategy.
pub fn crossover_ast(slippage_pct: f64, cost_preset: CostPreset) -> StrategyAst {
    let nodes = vec![
        AstNode {
            id: "close".into(),
            op: algotrace_engine::types::NodeOp::Price,
            params: BTreeMap::from([("field".into(), json!("close"))]),
            inputs: BTreeMap::new(),
        },
        AstNode {
            id: "fast".into(),
            op: algotrace_engine::types::NodeOp::Sma,
            params: BTreeMap::from([("period".into(), json!(2))]),
            inputs: BTreeMap::from([("input".into(), "close".into())]),
        },
        AstNode {
            id: "slow".into(),
            op: algotrace_engine::types::NodeOp::Sma,
            params: BTreeMap::from([("period".into(), json!(3))]),
            inputs: BTreeMap::from([("input".into(), "close".into())]),
        },
        AstNode {
            id: "entry".into(),
            op: algotrace_engine::types::NodeOp::CrossesAbove,
            params: BTreeMap::new(),
            inputs: BTreeMap::from([("a".into(), "fast".into()), ("b".into(), "slow".into())]),
        },
        AstNode {
            id: "exit".into(),
            op: algotrace_engine::types::NodeOp::CrossesBelow,
            params: BTreeMap::new(),
            inputs: BTreeMap::from([("a".into(), "fast".into()), ("b".into(), "slow".into())]),
        },
        AstNode {
            id: "strategy".into(),
            op: algotrace_engine::types::NodeOp::Strategy,
            params: BTreeMap::from([("position_size_pct".into(), json!(100))]),
            inputs: BTreeMap::from([
                ("entry".into(), "entry".into()),
                ("exit".into(), "exit".into()),
            ]),
        },
    ];
    StrategyAst {
        version: 1,
        config: StrategyConfig {
            initial_capital: 1_000.0,
            slippage_pct,
            cost_preset,
            force_close_at_end: false,
            risk_free_rate: 0.06,
            trading_days_per_year: 252,
        },
        nodes,
        sink: "strategy".into(),
    }
}

/// Validates an AGT1 test buffer and returns its borrowed view.
///
/// Example: `price_view(&bytes).unwrap().len()` returns its row count.
pub fn price_view(bytes: &[u8]) -> PriceView<'_> {
    read_price_file(bytes).expect("test rows must encode as valid OHLC bars")
}
