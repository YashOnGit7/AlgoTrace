// Purpose: checks arithmetic, comparisons, boolean logic, and scalar broadcasting.
// Connects: AST operations to the boolean entry/exit arrays consumed by the simulator.

use std::collections::BTreeMap;

use algotrace_engine::data::read_price_file;
use algotrace_engine::evaluator::{EvaluationPlan, EvaluationWorkspace};
use algotrace_engine::types::{AstNode, NodeOp, StrategyAst, StrategyConfig};
use serde_json::json;

/// Creates one operation node from its id, operation, parameters, and wired input ports.
///
/// Example: `node("close", NodeOp::Price, params, inputs)` describes a price source.
fn node(
    id: &str,
    op: NodeOp,
    params: BTreeMap<String, serde_json::Value>,
    inputs: BTreeMap<String, String>,
) -> AstNode {
    AstNode {
        id: id.into(),
        op,
        params,
        inputs,
    }
}

/// Creates a small AGT1 file with three valid close values.
///
/// Example: the first row closes at one and the third row closes at three.
fn three_close_bytes() -> Vec<u8> {
    let rows: [[f64; 6]; 3] = [
        [1.0, 1.0, 2.0, 0.5, 1.0, 10.0],
        [2.0, 2.0, 3.0, 1.5, 2.0, 10.0],
        [3.0, 3.0, 4.0, 2.5, 3.0, 10.0],
    ];
    let mut bytes = Vec::from(&b"AGT1"[..]);
    bytes.extend_from_slice(&3_u32.to_le_bytes());
    bytes.extend_from_slice(&[0; 8]);
    for column in 0..6 {
        for row in rows {
            bytes.extend_from_slice(&row[column].to_le_bytes());
        }
    }
    bytes
}

/// Checks scalar expansion, all four math operations, comparisons, and boolean operators.
///
/// Example: a close of one plus one becomes two and compares greater than two as false.
#[test]
fn evaluator_applies_series_math_comparisons_and_boolean_nodes() {
    let nodes = vec![
        node(
            "close",
            NodeOp::Price,
            BTreeMap::from([("field".into(), json!("close"))]),
            BTreeMap::new(),
        ),
        node(
            "two",
            NodeOp::Constant,
            BTreeMap::from([("value".into(), json!(2.0))]),
            BTreeMap::new(),
        ),
        node(
            "add",
            NodeOp::Add,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "close".into()), ("b".into(), "two".into())]),
        ),
        node(
            "one",
            NodeOp::Constant,
            BTreeMap::from([("value".into(), json!(1.0))]),
            BTreeMap::new(),
        ),
        node(
            "sub",
            NodeOp::Sub,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "add".into()), ("b".into(), "one".into())]),
        ),
        node(
            "mul",
            NodeOp::Mul,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "sub".into()), ("b".into(), "two".into())]),
        ),
        node(
            "div",
            NodeOp::Div,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "mul".into()), ("b".into(), "two".into())]),
        ),
        node(
            "zero",
            NodeOp::Constant,
            BTreeMap::from([("value".into(), json!(0.0))]),
            BTreeMap::new(),
        ),
        node(
            "gt",
            NodeOp::Gt,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "div".into()), ("b".into(), "two".into())]),
        ),
        node(
            "lt",
            NodeOp::Lt,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "close".into()), ("b".into(), "two".into())]),
        ),
        node(
            "and",
            NodeOp::And,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "gt".into()), ("b".into(), "lt".into())]),
        ),
        node(
            "or",
            NodeOp::Or,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "gt".into()), ("b".into(), "lt".into())]),
        ),
        node(
            "not",
            NodeOp::Not,
            BTreeMap::new(),
            BTreeMap::from([("input".into(), "and".into())]),
        ),
        node(
            "div_zero",
            NodeOp::Div,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "mul".into()), ("b".into(), "zero".into())]),
        ),
        node(
            "nan_comparison",
            NodeOp::Gt,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "div_zero".into()), ("b".into(), "zero".into())]),
        ),
        node(
            "entry",
            NodeOp::Or,
            BTreeMap::new(),
            BTreeMap::from([
                ("a".into(), "or".into()),
                ("b".into(), "nan_comparison".into()),
            ]),
        ),
        node(
            "strategy",
            NodeOp::Strategy,
            BTreeMap::new(),
            BTreeMap::from([
                ("entry".into(), "entry".into()),
                ("exit".into(), "not".into()),
            ]),
        ),
    ];
    let ast = StrategyAst {
        version: 1,
        config: StrategyConfig::default(),
        nodes,
        sink: "strategy".into(),
    };
    let bytes = three_close_bytes();
    let prices = read_price_file(&bytes).unwrap();
    let plan = EvaluationPlan::new(&ast).unwrap();
    let mut workspace = EvaluationWorkspace::default();
    let signals = plan.evaluate(prices, &mut workspace).unwrap();
    assert_eq!(signals.entry, [true, true, true]);
    assert_eq!(signals.exit, [true, true, true]);
}

/// Checks math with two constants is rejected because it has no per-bar series input.
///
/// Example: comparing two CONSTANT nodes returns an evaluator error instead of a signal.
#[test]
fn evaluator_rejects_math_without_a_series_operand() {
    let nodes = vec![
        node(
            "one",
            NodeOp::Constant,
            BTreeMap::from([("value".into(), json!(1.0))]),
            BTreeMap::new(),
        ),
        node(
            "two",
            NodeOp::Constant,
            BTreeMap::from([("value".into(), json!(2.0))]),
            BTreeMap::new(),
        ),
        node(
            "entry",
            NodeOp::Gt,
            BTreeMap::new(),
            BTreeMap::from([("a".into(), "one".into()), ("b".into(), "two".into())]),
        ),
        node(
            "strategy",
            NodeOp::Strategy,
            BTreeMap::new(),
            BTreeMap::from([
                ("entry".into(), "entry".into()),
                ("exit".into(), "entry".into()),
            ]),
        ),
    ];
    let ast = StrategyAst {
        version: 1,
        config: StrategyConfig::default(),
        nodes,
        sink: "strategy".into(),
    };
    let bytes = three_close_bytes();
    let prices = read_price_file(&bytes).unwrap();
    let plan = EvaluationPlan::new(&ast).unwrap();
    let mut workspace = EvaluationWorkspace::default();
    assert!(plan.evaluate(prices, &mut workspace).is_err());
}
