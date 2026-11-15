//! Purpose: prepares and evaluates ordered Strategy AST nodes into reusable series buffers.
//! Connects: the compiler AST and borrowed price bars to simulator entry/exit signals.

use std::collections::{BTreeMap, HashMap};

use serde_json::Value as JsonValue;

use crate::indicators::{ema_into, rsi_into, sma_into};
use crate::types::{
    AstNode, EngineError, EngineResult, EvaluatedSignals, NodeOp, NodeValue, PriceField, PriceView,
    StrategyAst,
};

/// Holds parsed node operations and their slot references for repeated evaluations.
///
/// Example: `let plan = EvaluationPlan::new(&ast)?;` parses node ids once for a parameter sweep.
#[derive(Clone, Debug)]
pub struct EvaluationPlan {
    nodes: Vec<PlannedNode>,
    entry_slot: usize,
    exit_slot: usize,
    strategy: StrategyParameters,
}

/// Stores one parsed AST operation and references only earlier dependency slots.
#[derive(Clone, Debug)]
struct PlannedNode {
    id: String,
    op: NodeOp,
    params: BTreeMap<String, JsonValue>,
    inputs: BTreeMap<String, usize>,
}

/// Stores position sizing and optional risk exits from the sink node.
///
/// Example: omitted stop and target values mean those exit features stay disabled.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StrategyParameters {
    pub position_size_pct: f64,
    pub stop_loss_pct: Option<f64>,
    pub take_profit_pct: Option<f64>,
}

/// Owns node outputs so repeated evaluations can reuse each vector's capacity.
///
/// Example: pass one workspace to every sweep run to avoid recreating indicator arrays.
#[derive(Clone, Debug, Default)]
pub struct EvaluationWorkspace {
    values: Vec<NodeValue>,
}

impl EvaluationPlan {
    /// Validates version, ids, dependencies, and sink wiring, then stores compact slot indexes.
    ///
    /// Example: `EvaluationPlan::new(&ast)?` prepares an AST for one or many runs.
    pub fn new(ast: &StrategyAst) -> EngineResult<Self> {
        if ast.version != 1 {
            return Err(EngineError::new("strategy AST version must be 1"));
        }
        let mut ids = HashMap::with_capacity(ast.nodes.len());
        let strategy_count = ast
            .nodes
            .iter()
            .filter(|node| node.op == NodeOp::Strategy)
            .count();
        if strategy_count != 1 {
            return Err(EngineError::new(
                "strategy AST must contain exactly one STRATEGY node",
            ));
        }
        for (slot, node) in ast.nodes.iter().enumerate() {
            validate_node_parameters(node)?;
            if ids.insert(node.id.as_str(), slot).is_some() {
                return Err(EngineError::new(format!(
                    "duplicate AST node id: {}",
                    node.id
                )));
            }
        }
        let sink_slot = *ids
            .get(ast.sink.as_str())
            .ok_or_else(|| EngineError::new("strategy sink id is missing from nodes"))?;
        let sink = &ast.nodes[sink_slot];
        if sink.op != NodeOp::Strategy {
            return Err(EngineError::new("AST sink must be a STRATEGY node"));
        }
        let entry_slot = resolve_input(&sink.inputs, "entry", &ids, sink_slot)?;
        let exit_slot = resolve_input(&sink.inputs, "exit", &ids, sink_slot)?;
        let strategy = StrategyParameters {
            position_size_pct: number_param_or(&sink.params, "position_size_pct", 100.0)?,
            stop_loss_pct: optional_number_param(&sink.params, "stop_loss_pct")?,
            take_profit_pct: optional_number_param(&sink.params, "take_profit_pct")?,
        };
        if !(1.0..=100.0).contains(&strategy.position_size_pct) {
            return Err(EngineError::new("position_size_pct must be in 1..=100"));
        }
        if strategy
            .stop_loss_pct
            .is_some_and(|value| !(0.1..=50.0).contains(&value))
        {
            return Err(EngineError::new("stop_loss_pct must be in 0.1..=50"));
        }
        if strategy
            .take_profit_pct
            .is_some_and(|value| !(0.1..=500.0).contains(&value))
        {
            return Err(EngineError::new("take_profit_pct must be in 0.1..=500"));
        }

        let mut planned = Vec::with_capacity(ast.nodes.len());
        for (slot, node) in ast.nodes.iter().enumerate() {
            let mut input_slots = BTreeMap::new();
            for (port, source_id) in &node.inputs {
                let source_slot = *ids.get(source_id.as_str()).ok_or_else(|| {
                    EngineError::new(format!(
                        "node {} input {port} refers to missing id {source_id}",
                        node.id
                    ))
                })?;
                if source_slot >= slot {
                    return Err(EngineError::new(format!(
                        "node {} is not after its dependency {source_id}",
                        node.id
                    )));
                }
                input_slots.insert(port.clone(), source_slot);
            }
            planned.push(PlannedNode {
                id: node.id.clone(),
                op: node.op,
                params: node.params.clone(),
                inputs: input_slots,
            });
        }
        Ok(Self {
            nodes: planned,
            entry_slot,
            exit_slot,
            strategy,
        })
    }

    /// Returns the strategy-level share sizing and risk-exit settings.
    ///
    /// Example: `plan.strategy_parameters().position_size_pct` is 100 by default.
    pub fn strategy_parameters(&self) -> StrategyParameters {
        self.strategy
    }

    /// Changes one existing numeric parameter without rebuilding the graph plan.
    ///
    /// Example: `plan.set_numeric_parameter("sma_fast", "period", 10.0)?` updates a sweep's period.
    pub fn set_numeric_parameter(
        &mut self,
        node_id: &str,
        key: &str,
        value: f64,
    ) -> EngineResult<()> {
        if !value.is_finite() {
            return Err(EngineError::new("sweep parameter values must be finite"));
        }
        let node = self
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id)
            .ok_or_else(|| EngineError::new(format!("sweep node id {node_id} does not exist")))?;
        match (node.op, key) {
            (NodeOp::Sma | NodeOp::Ema, "period") if !(2.0..=500.0).contains(&value) => {
                return Err(EngineError::new(
                    "SMA and EMA sweep periods must be in 2..=500",
                ));
            }
            (NodeOp::Rsi, "period") if !(2.0..=200.0).contains(&value) => {
                return Err(EngineError::new("RSI sweep periods must be in 2..=200"));
            }
            (NodeOp::Delay, "bars") if !(1.0..=50.0).contains(&value) => {
                return Err(EngineError::new("DELAY sweep bars must be in 1..=50"));
            }
            _ => {}
        }
        let json_value = if key == "period" || key == "bars" {
            if value < 0.0 || value.fract() != 0.0 || value > u64::MAX as f64 {
                return Err(EngineError::new(format!(
                    "sweep parameter {key} must be a whole number"
                )));
            }
            JsonValue::from(value as u64)
        } else {
            JsonValue::from(value)
        };
        if let Some(existing) = node.params.get_mut(key) {
            *existing = json_value;
        } else {
            node.params.insert(key.to_owned(), json_value);
        }
        if node.op == NodeOp::Strategy {
            match key {
                "position_size_pct" => self.strategy.position_size_pct = value,
                "stop_loss_pct" => self.strategy.stop_loss_pct = Some(value),
                "take_profit_pct" => self.strategy.take_profit_pct = Some(value),
                _ => {}
            }
        }
        if self.strategy.position_size_pct < 1.0 || self.strategy.position_size_pct > 100.0 {
            return Err(EngineError::new("position_size_pct must be in 1..=100"));
        }
        if self
            .strategy
            .stop_loss_pct
            .is_some_and(|item| !(0.1..=50.0).contains(&item))
        {
            return Err(EngineError::new("stop_loss_pct must be in 0.1..=50"));
        }
        if self
            .strategy
            .take_profit_pct
            .is_some_and(|item| !(0.1..=500.0).contains(&item))
        {
            return Err(EngineError::new("take_profit_pct must be in 0.1..=500"));
        }
        Ok(())
    }

    /// Evaluates every AST node, preserving series allocations in the supplied workspace.
    ///
    /// Example: `plan.evaluate(prices, &mut workspace)?` returns borrowed entry and exit signals.
    pub fn evaluate<'a>(
        &self,
        prices: PriceView<'_>,
        workspace: &'a mut EvaluationWorkspace,
    ) -> EngineResult<EvaluatedSignals<'a>> {
        if workspace.values.len() != self.nodes.len() {
            workspace.values.resize(self.nodes.len(), NodeValue::Empty);
        }
        for (slot, node) in self.nodes.iter().enumerate() {
            let (earlier, current_and_later) = workspace.values.split_at_mut(slot);
            let output = &mut current_and_later[0];
            evaluate_node(node, earlier, output, prices)?;
        }
        let entry = bool_series(&workspace.values[self.entry_slot], "strategy entry")?;
        let exit = bool_series(&workspace.values[self.exit_slot], "strategy exit")?;
        Ok(EvaluatedSignals { entry, exit })
    }
}

/// Evaluates one node using only earlier slots and reuses its previous output buffer.
///
/// Example: an ADD node writes into its existing `NumberSeries` allocation on a second sweep run.
fn evaluate_node(
    node: &PlannedNode,
    earlier: &[NodeValue],
    output: &mut NodeValue,
    prices: PriceView<'_>,
) -> EngineResult<()> {
    let len = prices.len();
    match node.op {
        NodeOp::Price => {
            let field = price_field(&node.params)?;
            let values = number_output(output, len);
            for (index, value) in values.iter_mut().enumerate() {
                *value = prices.value(field, index)?;
            }
        }
        NodeOp::Constant => *output = NodeValue::Number(number_param(&node.params, "value")?),
        NodeOp::Sma | NodeOp::Ema | NodeOp::Rsi => {
            let source = series_input(node, earlier, "input")?;
            let period = integer_param(&node.params, "period")?;
            let values = number_output(output, len);
            match node.op {
                NodeOp::Sma => sma_into(source, period, values)?,
                NodeOp::Ema => ema_into(source, period, values)?,
                NodeOp::Rsi => rsi_into(source, period, values)?,
                _ => unreachable!("indicator match includes only SMA, EMA, and RSI"),
            }
        }
        NodeOp::Delay => {
            let delay = integer_param(&node.params, "bars")?;
            let input_slot = input_slot(node, "input")?;
            match &earlier[input_slot] {
                NodeValue::NumberSeries(input) => {
                    let values = number_output(output, len);
                    values.fill(f64::NAN);
                    if delay < len {
                        values[delay..].copy_from_slice(&input[..len - delay]);
                    }
                }
                NodeValue::BoolSeries(input) => {
                    let values = bool_output(output, len);
                    values.fill(false);
                    if delay < len {
                        values[delay..].copy_from_slice(&input[..len - delay]);
                    }
                }
                _ => return Err(node_error(node, "DELAY input must be a series")),
            }
        }
        NodeOp::Add | NodeOp::Sub | NodeOp::Mul | NodeOp::Div => {
            let a = numeric_input(node, earlier, "a")?;
            let b = numeric_input(node, earlier, "b")?;
            require_series_operand(node, a, b)?;
            let values = number_output(output, len);
            for (index, output_value) in values.iter_mut().enumerate() {
                let left = at(a, index);
                let right = at(b, index);
                *output_value = match node.op {
                    NodeOp::Add => left + right,
                    NodeOp::Sub => left - right,
                    NodeOp::Mul => left * right,
                    NodeOp::Div if right == 0.0 => f64::NAN,
                    NodeOp::Div => left / right,
                    _ => unreachable!("math match includes only arithmetic operations"),
                };
            }
        }
        NodeOp::Gt | NodeOp::Lt | NodeOp::CrossesAbove | NodeOp::CrossesBelow => {
            let a = numeric_input(node, earlier, "a")?;
            let b = numeric_input(node, earlier, "b")?;
            require_series_operand(node, a, b)?;
            let values = bool_output(output, len);
            values.fill(false);
            for (index, output_value) in values.iter_mut().enumerate() {
                let left = at(a, index);
                let right = at(b, index);
                if left.is_nan() || right.is_nan() {
                    continue;
                }
                *output_value = match node.op {
                    NodeOp::Gt => left > right,
                    NodeOp::Lt => left < right,
                    NodeOp::CrossesAbove if index > 0 => {
                        let previous_a = at(a, index - 1);
                        let previous_b = at(b, index - 1);
                        !previous_a.is_nan()
                            && !previous_b.is_nan()
                            && previous_a <= previous_b
                            && left > right
                    }
                    NodeOp::CrossesBelow if index > 0 => {
                        let previous_a = at(a, index - 1);
                        let previous_b = at(b, index - 1);
                        !previous_a.is_nan()
                            && !previous_b.is_nan()
                            && previous_a >= previous_b
                            && left < right
                    }
                    NodeOp::CrossesAbove | NodeOp::CrossesBelow => false,
                    _ => unreachable!("comparison match includes only comparison operations"),
                };
            }
        }
        NodeOp::And | NodeOp::Or => {
            let a = bool_input(node, earlier, "a")?;
            let b = bool_input(node, earlier, "b")?;
            let values = bool_output(output, len);
            for index in 0..len {
                values[index] = match node.op {
                    NodeOp::And => a[index] && b[index],
                    NodeOp::Or => a[index] || b[index],
                    _ => unreachable!("boolean match includes only AND and OR"),
                };
            }
        }
        NodeOp::Not => {
            let input = bool_input(node, earlier, "input")?;
            let values = bool_output(output, len);
            for (result, value) in values.iter_mut().zip(input) {
                *result = !value;
            }
        }
        NodeOp::Strategy => *output = NodeValue::Empty,
    }
    Ok(())
}

/// Returns the source slot for a named AST port or a clear malformed-AST error.
///
/// Example: `input_slot(node, "input")?` finds an indicator's source series.
fn input_slot(node: &PlannedNode, port: &str) -> EngineResult<usize> {
    node.inputs
        .get(port)
        .copied()
        .ok_or_else(|| node_error(node, &format!("required input {port} is missing")))
}

/// Resolves a sink input id to its already-validated node slot.
///
/// Example: the STRATEGY node's `entry` port resolves to its boolean source node.
fn resolve_input(
    inputs: &BTreeMap<String, String>,
    port: &str,
    ids: &HashMap<&str, usize>,
    sink_slot: usize,
) -> EngineResult<usize> {
    let source_id = inputs
        .get(port)
        .ok_or_else(|| EngineError::new(format!("strategy {port} input is missing")))?;
    let source_slot = *ids.get(source_id.as_str()).ok_or_else(|| {
        EngineError::new(format!("strategy input refers to missing node {source_id}"))
    })?;
    if source_slot >= sink_slot {
        return Err(EngineError::new(
            "strategy node must appear after its signal nodes",
        ));
    }
    Ok(source_slot)
}

/// Reads a number parameter and reports a field-specific error when it is absent or mistyped.
///
/// Example: `number_param(&params, "value")?` reads a CONSTANT node's scalar.
fn number_param(params: &BTreeMap<String, JsonValue>, key: &str) -> EngineResult<f64> {
    params
        .get(key)
        .and_then(JsonValue::as_f64)
        .ok_or_else(|| EngineError::new(format!("parameter {key} must be a number")))
}

/// Reads an optional numeric parameter, keeping omission distinct from zero.
///
/// Example: `optional_number_param(&params, "stop_loss_pct")?` is `None` when the stop is off.
fn optional_number_param(
    params: &BTreeMap<String, JsonValue>,
    key: &str,
) -> EngineResult<Option<f64>> {
    params
        .get(key)
        .map(|_| number_param(params, key))
        .transpose()
}

/// Reads a numeric parameter or uses its documented default when absent.
///
/// Example: `number_param_or(&params, "position_size_pct", 100.0)?` applies full sizing by default.
fn number_param_or(
    params: &BTreeMap<String, JsonValue>,
    key: &str,
    default: f64,
) -> EngineResult<f64> {
    if params.contains_key(key) {
        number_param(params, key)
    } else {
        Ok(default)
    }
}

/// Reads a non-negative whole-number parameter such as an indicator period or delay.
///
/// Example: `integer_param(&params, "period")?` converts JSON `3` to `usize`.
fn integer_param(params: &BTreeMap<String, JsonValue>, key: &str) -> EngineResult<usize> {
    params
        .get(key)
        .and_then(JsonValue::as_u64)
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| EngineError::new(format!("parameter {key} must be a non-negative integer")))
}

/// Reads the configured price field from a PRICE node.
///
/// Example: a PRICE node with `field: "close"` selects `PriceField::Close`.
fn price_field(params: &BTreeMap<String, JsonValue>) -> EngineResult<PriceField> {
    match params.get("field").and_then(JsonValue::as_str) {
        Some("open") => Ok(PriceField::Open),
        Some("high") => Ok(PriceField::High),
        Some("low") => Ok(PriceField::Low),
        Some("close") => Ok(PriceField::Close),
        Some("volume") => Ok(PriceField::Volume),
        _ => Err(EngineError::new(
            "PRICE field must be open, high, low, close, or volume",
        )),
    }
}

/// Returns a scalar or bar-series input from a dependency slot.
///
/// Example: a CONSTANT input remains scalar until an arithmetic node reads it at each bar.
fn numeric_input<'a>(
    node: &PlannedNode,
    values: &'a [NodeValue],
    port: &str,
) -> EngineResult<NumericInput<'a>> {
    match &values[input_slot(node, port)?] {
        NodeValue::Number(number) => Ok(NumericInput::Scalar(*number)),
        NodeValue::NumberSeries(series) => Ok(NumericInput::Series(series)),
        _ => Err(node_error(node, &format!("input {port} must be numeric"))),
    }
}

/// Returns a numeric series input required by an indicator.
///
/// Example: `series_input(node, values, "input")?` obtains the source for an SMA node.
fn series_input<'a>(
    node: &PlannedNode,
    values: &'a [NodeValue],
    port: &str,
) -> EngineResult<&'a [f64]> {
    match &values[input_slot(node, port)?] {
        NodeValue::NumberSeries(series) => Ok(series),
        _ => Err(node_error(
            node,
            &format!("input {port} must be a numeric series"),
        )),
    }
}

/// Returns a boolean series input required by logical operations.
///
/// Example: `bool_input(node, values, "a")?` obtains the left input for an AND node.
fn bool_input<'a>(
    node: &PlannedNode,
    values: &'a [NodeValue],
    port: &str,
) -> EngineResult<&'a [bool]> {
    match &values[input_slot(node, port)?] {
        NodeValue::BoolSeries(series) => Ok(series),
        _ => Err(node_error(
            node,
            &format!("input {port} must be a boolean series"),
        )),
    }
}

/// Returns the final strategy signals as a checked boolean series.
///
/// Example: `bool_series(&value, "entry")?` rejects a numeric STRATEGY input.
fn bool_series<'a>(value: &'a NodeValue, label: &str) -> EngineResult<&'a [bool]> {
    match value {
        NodeValue::BoolSeries(series) => Ok(series),
        _ => Err(EngineError::new(format!(
            "{label} input must be a boolean series"
        ))),
    }
}

/// Provides indexed access to either a scalar or its corresponding bar value.
///
/// Example: `at(NumericInput::Scalar(2.0), 5)` returns `2.0` for every bar.
fn at(input: NumericInput<'_>, index: usize) -> f64 {
    match input {
        NumericInput::Scalar(value) => value,
        NumericInput::Series(values) => values[index],
    }
}

/// Represents one scalar or a borrowed per-bar numeric input.
#[derive(Clone, Copy)]
enum NumericInput<'a> {
    Scalar(f64),
    Series(&'a [f64]),
}

/// Reuses or creates the numeric output allocation for the current node.
///
/// Example: a prior run's SMA buffer is resized in place for the next parameter value.
fn number_output(output: &mut NodeValue, len: usize) -> &mut Vec<f64> {
    if !matches!(output, NodeValue::NumberSeries(_)) {
        *output = NodeValue::NumberSeries(Vec::with_capacity(len));
    }
    let NodeValue::NumberSeries(values) = output else {
        unreachable!("numeric output was created above")
    };
    values.resize(len, f64::NAN);
    values
}

/// Reuses or creates the boolean output allocation for the current node.
///
/// Example: a prior run's crossover buffer keeps its capacity on the next evaluation.
fn bool_output(output: &mut NodeValue, len: usize) -> &mut Vec<bool> {
    if !matches!(output, NodeValue::BoolSeries(_)) {
        *output = NodeValue::BoolSeries(Vec::with_capacity(len));
    }
    let NodeValue::BoolSeries(values) = output else {
        unreachable!("boolean output was created above")
    };
    values.resize(len, false);
    values
}

/// Turns a malformed node or port into an error with the node id in its message.
///
/// Example: `node_error(node, "input missing")` identifies which graph node needs repair.
fn node_error(node: &PlannedNode, message: &str) -> EngineError {
    EngineError::new(format!("node {}: {message}", node.id))
}

/// Checks catalog parameter bounds before an AST can reach the evaluator loop.
///
/// Example: an SMA period of 1 is rejected because the node catalog starts at 2.
fn validate_node_parameters(node: &AstNode) -> EngineResult<()> {
    match node.op {
        NodeOp::Sma | NodeOp::Ema => {
            let period = integer_param(&node.params, "period")?;
            if !(2..=500).contains(&period) {
                return Err(EngineError::new(format!(
                    "node {} period must be in 2..=500",
                    node.id
                )));
            }
        }
        NodeOp::Rsi => {
            let period = integer_param(&node.params, "period")?;
            if !(2..=200).contains(&period) {
                return Err(EngineError::new(format!(
                    "node {} period must be in 2..=200",
                    node.id
                )));
            }
        }
        NodeOp::Delay => {
            let bars = integer_param(&node.params, "bars")?;
            if !(1..=50).contains(&bars) {
                return Err(EngineError::new(format!(
                    "node {} bars must be in 1..=50",
                    node.id
                )));
            }
        }
        NodeOp::Constant => {
            number_param(&node.params, "value")?;
        }
        NodeOp::Price => {
            price_field(&node.params)?;
        }
        _ => {}
    }
    Ok(())
}

/// Rejects arithmetic or comparison inputs that are both scalars rather than bar series.
///
/// Example: two CONSTANT nodes cannot produce a bar-by-bar comparison without a Series input.
fn require_series_operand(
    node: &PlannedNode,
    a: NumericInput<'_>,
    b: NumericInput<'_>,
) -> EngineResult<()> {
    if matches!((a, b), (NumericInput::Scalar(_), NumericInput::Scalar(_))) {
        return Err(node_error(
            node,
            "math and comparisons require at least one Series input",
        ));
    }
    Ok(())
}

/// Returns the AST node identified by `id` for sweep parameter updates.
///
/// Example: `find_node_mut(&mut ast, "sma_fast")?` locates a period to vary.
pub fn find_node_mut<'a>(ast: &'a mut StrategyAst, id: &str) -> EngineResult<&'a mut AstNode> {
    ast.nodes
        .iter_mut()
        .find(|node| node.id == id)
        .ok_or_else(|| EngineError::new(format!("node id {id} does not exist")))
}
