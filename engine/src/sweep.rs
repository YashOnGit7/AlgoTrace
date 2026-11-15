//! Purpose: runs one strategy repeatedly across parameter values with reusable buffers.
//! Connects: a chosen AST parameter to per-run metric summaries for the heatmap UI.

use crate::evaluator::{EvaluationPlan, EvaluationWorkspace};
use crate::simulator::{simulate_into, SimulationWorkspace};
use crate::types::{EngineError, EngineResult, Metrics, PriceView, StrategyAst};

/// Selects one existing numeric node parameter and its candidate values.
///
/// Example: `SweepParameter { node_id: "fast".into(), name: "period".into(), values: vec![5.0, 10.0] }`.
#[derive(Clone, Debug, PartialEq)]
pub struct SweepParameter {
    pub node_id: String,
    pub name: String,
    pub values: Vec<f64>,
}

/// Stores one sweep input and the resulting summary metrics.
///
/// Example: each point can provide `total_return` as one cell in a parameter heatmap.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct SweepPoint {
    pub value: f64,
    pub metrics: Metrics,
}

/// Runs a prepared strategy for each requested value while borrowing the same prices.
///
/// Example: `run_sweep(&ast, prices, &sweep)?` evaluates periods 5 and 10 with reused arrays.
pub fn run_sweep(
    ast: &StrategyAst,
    prices: PriceView<'_>,
    parameter: &SweepParameter,
) -> EngineResult<Vec<SweepPoint>> {
    if parameter.values.is_empty() {
        return Err(EngineError::new(
            "a parameter sweep requires at least one value",
        ));
    }
    let mut plan = EvaluationPlan::new(ast)?;
    let mut evaluation = EvaluationWorkspace::default();
    let mut simulation = SimulationWorkspace::default();
    let mut points = Vec::with_capacity(parameter.values.len());
    for value in &parameter.values {
        plan.set_numeric_parameter(&parameter.node_id, &parameter.name, *value)?;
        let signals = plan.evaluate(prices, &mut evaluation)?;
        simulate_into(
            prices,
            signals.entry,
            signals.exit,
            &ast.config,
            plan.strategy_parameters(),
            &mut simulation,
        )?;
        points.push(SweepPoint {
            value: *value,
            metrics: simulation.result().metrics.clone(),
        });
    }
    Ok(points)
}
