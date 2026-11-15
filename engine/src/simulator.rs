//! Purpose: applies daily signals, whole-share fills, costs, stops, targets, and equity marking.
//! Connects: evaluator signals and price bars to trades and results consumed by metrics.

use crate::costs::{calculate_charges_with_rates, prepare_cost_preset, CostRates, FillSide};
use crate::evaluator::{EvaluationPlan, EvaluationWorkspace, StrategyParameters};
use crate::metrics::calculate_metrics;
use crate::types::{
    BacktestResult, EngineError, EngineResult, EquityPoint, ExitReason, PriceField, PriceView,
    StrategyAst, StrategyConfig, Trade,
};

/// Reuses result vectors while one strategy or a sweep is simulated repeatedly.
///
/// Example: `let mut scratch = SimulationWorkspace::default();` retains trade and equity capacity.
#[derive(Clone, Debug, Default)]
pub struct SimulationWorkspace {
    result: BacktestResult,
    holding_bars: usize,
}

impl Default for BacktestResult {
    /// Creates an empty result that can be filled by the simulator.
    ///
    /// Example: `BacktestResult::default().trades.is_empty()` is true.
    fn default() -> Self {
        Self {
            trades: Vec::new(),
            equity_curve: Vec::new(),
            metrics: Default::default(),
        }
    }
}

impl SimulationWorkspace {
    /// Borrows the most recent simulation output.
    ///
    /// Example: `workspace.result().equity_curve.len()` equals the number of simulated bars.
    pub fn result(&self) -> &BacktestResult {
        &self.result
    }

    /// Returns the number of bars on which a position was held for any part of the session.
    ///
    /// Example: a buy and stop-out on the same bar contributes one exposure bar.
    pub fn holding_bars(&self) -> usize {
        self.holding_bars
    }
}

/// Runs the complete AST through reusable evaluator and simulator workspaces.
///
/// Example: `run_backtest(&ast, prices)?` returns trades and an equity point for every daily bar.
pub fn run_backtest(ast: &StrategyAst, prices: PriceView<'_>) -> EngineResult<BacktestResult> {
    let plan = EvaluationPlan::new(ast)?;
    let mut evaluation = EvaluationWorkspace::default();
    let signals = plan.evaluate(prices, &mut evaluation)?;
    let mut simulation = SimulationWorkspace::default();
    simulate_into(
        prices,
        signals.entry,
        signals.exit,
        &ast.config,
        plan.strategy_parameters(),
        &mut simulation,
    )?;
    Ok(simulation.result.clone())
}

/// Simulates signals into a workspace, keeping vector allocations available for the next run.
///
/// Example: use the same workspace for each sweep value and read `workspace.result()` after each run.
pub fn simulate_into(
    prices: PriceView<'_>,
    entry: &[bool],
    exit: &[bool],
    config: &StrategyConfig,
    parameters: StrategyParameters,
    workspace: &mut SimulationWorkspace,
) -> EngineResult<()> {
    if prices.is_empty() {
        return Err(EngineError::new(
            "a backtest requires at least one price bar",
        ));
    }
    if entry.len() != prices.len() || exit.len() != prices.len() {
        return Err(EngineError::new(
            "entry and exit signals must match the price bar count",
        ));
    }
    validate_config(config)?;
    workspace.result.trades.clear();
    workspace.result.equity_curve.clear();
    workspace.holding_bars = 0;
    workspace.result.equity_curve.reserve(prices.len());

    let mut cash = config.initial_capital;
    let cost_rates = prepare_cost_preset(&config.cost_preset)?;
    let slippage_fraction = config.slippage_pct / 100.0;
    let position_size_fraction = parameters.position_size_pct / 100.0;
    let stop_loss_fraction = parameters.stop_loss_pct.map(|percent| percent / 100.0);
    let take_profit_fraction = parameters.take_profit_pct.map(|percent| percent / 100.0);
    let mut total_charges = 0.0;
    let mut position: Option<Position> = None;
    for bar in 0..prices.len() {
        let mut held_during_bar = position.is_some();
        if bar > 0 {
            if position.is_some() && exit[bar - 1] {
                close_at_open(
                    prices,
                    bar,
                    &mut SimulationLedger {
                        cost_rates: &cost_rates,
                        slippage_fraction,
                        cash: &mut cash,
                        total_charges: &mut total_charges,
                        position: &mut position,
                        trades: &mut workspace.result.trades,
                    },
                    ExitReason::Signal,
                )?;
                // A position held from the prior close remains exposed during its exit bar.
            } else if position.is_none() && entry[bar - 1] && !exit[bar - 1] {
                position = open_at_open(
                    prices,
                    bar,
                    &cost_rates,
                    slippage_fraction,
                    position_size_fraction,
                    stop_loss_fraction,
                    take_profit_fraction,
                    &mut cash,
                    &mut total_charges,
                    &mut workspace.result.trades,
                )?;
                held_during_bar = position.is_some();
            }
        }

        if let Some(open_position) = position.as_ref() {
            let low = prices.value(PriceField::Low, bar)?;
            let high = prices.value(PriceField::High, bar)?;
            let open = prices.value(PriceField::Open, bar)?;
            if let Some((fill_price, reason)) =
                protective_exit(open, low, high, open_position, slippage_fraction)
            {
                close_at_price(
                    bar,
                    fill_price,
                    reason,
                    &mut SimulationLedger {
                        cost_rates: &cost_rates,
                        slippage_fraction,
                        cash: &mut cash,
                        total_charges: &mut total_charges,
                        position: &mut position,
                        trades: &mut workspace.result.trades,
                    },
                )?;
            }
        }

        if held_during_bar || position.is_some() {
            workspace.holding_bars += 1;
        }
        let close = prices.value(PriceField::Close, bar)?;
        let shares = position
            .as_ref()
            .map_or(0, |open_position| open_position.shares);
        let equity = cash + shares as f64 * close;
        workspace.result.equity_curve.push(EquityPoint {
            bar,
            cash,
            shares,
            equity,
            buy_and_hold: config.initial_capital * close / prices.value(PriceField::Close, 0)?,
        });
    }

    if config.force_close_at_end && position.is_some() {
        let last_bar = prices.len() - 1;
        let close = prices.value(PriceField::Close, last_bar)?;
        let fill_price = close * (1.0 - slippage_fraction);
        close_at_price(
            last_bar,
            fill_price,
            ExitReason::EndOfData,
            &mut SimulationLedger {
                cost_rates: &cost_rates,
                slippage_fraction,
                cash: &mut cash,
                total_charges: &mut total_charges,
                position: &mut position,
                trades: &mut workspace.result.trades,
            },
        )?;
        let point = workspace
            .result
            .equity_curve
            .last_mut()
            .expect("at least one equity point was recorded");
        point.cash = cash;
        point.shares = 0;
        point.equity = cash;
    }

    workspace.result.metrics = calculate_metrics(
        &workspace.result.equity_curve,
        &workspace.result.trades,
        config,
        workspace.holding_bars,
        total_charges,
    )?;
    Ok(())
}

/// Holds the purchase details needed to calculate a later net result.
#[derive(Clone, Copy, Debug)]
struct Position {
    shares: u64,
    entry_notional: f64,
    entry_charges: crate::types::ChargeBreakdown,
    stop_price: Option<f64>,
    target_price: Option<f64>,
}

/// Bundles mutable portfolio state so sell helpers cannot accidentally use stale cash.
struct SimulationLedger<'a> {
    cost_rates: &'a CostRates,
    slippage_fraction: f64,
    cash: &'a mut f64,
    total_charges: &'a mut f64,
    position: &'a mut Option<Position>,
    trades: &'a mut Vec<Trade>,
}

/// Fills a pending buy at the next bar's open with slippage and whole-share sizing.
///
/// Example: a buy signal at bar zero is filled at bar one's open, never at bar zero's close.
#[allow(clippy::too_many_arguments)] // The arguments keep per-run converted assumptions explicit.
fn open_at_open(
    prices: PriceView<'_>,
    bar: usize,
    cost_rates: &CostRates,
    slippage_fraction: f64,
    position_size_fraction: f64,
    stop_loss_fraction: Option<f64>,
    take_profit_fraction: Option<f64>,
    cash: &mut f64,
    total_charges: &mut f64,
    trades: &mut Vec<Trade>,
) -> EngineResult<Option<Position>> {
    let raw_open = prices.value(PriceField::Open, bar)?;
    let fill_price = raw_open * (1.0 + slippage_fraction);
    let budget = position_size_fraction * *cash;
    let shares = largest_affordable_shares(fill_price, budget, cost_rates)?;
    if shares == 0 {
        return Ok(None);
    }
    let entry_notional = shares as f64 * fill_price;
    let entry_charges = calculate_charges_with_rates(cost_rates, FillSide::Buy, entry_notional);
    let spent = entry_notional + entry_charges.total();
    *cash = (*cash - spent).max(0.0);
    *total_charges += entry_charges.total();
    let stop_price = stop_loss_fraction.map(|fraction| fill_price * (1.0 - fraction));
    let target_price = take_profit_fraction.map(|fraction| fill_price * (1.0 + fraction));
    trades.push(Trade {
        entry_bar: bar,
        exit_bar: None,
        shares,
        entry_price: fill_price,
        exit_price: None,
        exit_reason: None,
        entry_charges,
        exit_charges: None,
        net_profit: None,
    });
    Ok(Some(Position {
        shares,
        entry_notional,
        entry_charges,
        stop_price,
        target_price,
    }))
}

/// Finds the greatest integer share count whose notional and buy charges fit the budget.
///
/// Example: if two shares fit but three plus charges do not, this returns `2`.
fn largest_affordable_shares(
    fill_price: f64,
    budget: f64,
    preset: &CostRates,
) -> EngineResult<u64> {
    if !fill_price.is_finite() || fill_price <= 0.0 || !budget.is_finite() || budget <= 0.0 {
        return Ok(0);
    }
    let upper = (budget / fill_price).floor().min(u64::MAX as f64) as u64;
    let mut low = 0_u64;
    let mut high = upper;
    while low < high {
        let distance = high - low;
        let candidate = low + distance / 2 + distance % 2;
        let turnover = candidate as f64 * fill_price;
        let charges = calculate_charges_with_rates(preset, FillSide::Buy, turnover).total();
        if turnover + charges <= budget {
            low = candidate;
        } else {
            high = candidate - 1;
        }
    }
    Ok(low)
}

/// Fills a next-open sell and records its complete per-fill charges.
///
/// Example: a sell signal at bar two fills at bar three's open after sell slippage.
fn close_at_open(
    prices: PriceView<'_>,
    bar: usize,
    ledger: &mut SimulationLedger<'_>,
    reason: ExitReason,
) -> EngineResult<()> {
    let raw_open = prices.value(PriceField::Open, bar)?;
    let fill_price = raw_open * (1.0 - ledger.slippage_fraction);
    close_at_price(bar, fill_price, reason, ledger)
}

/// Applies an exact stop, target, or end-of-data fill without adding slippage.
///
/// Example: a stop touched at 90 closes at 90 even if the default open slippage is nonzero.
fn close_at_price(
    bar: usize,
    fill_price: f64,
    reason: ExitReason,
    ledger: &mut SimulationLedger<'_>,
) -> EngineResult<()> {
    let open_position = ledger
        .position
        .as_ref()
        .ok_or_else(|| EngineError::new("cannot sell while no position is open"))?;
    let turnover = open_position.shares as f64 * fill_price;
    let exit_charges = calculate_charges_with_rates(ledger.cost_rates, FillSide::Sell, turnover);
    let cash_after_sell = *ledger.cash + turnover - exit_charges.total();
    if cash_after_sell < 0.0 {
        return Err(EngineError::new(
            "sell charges exceed available cash and proceeds; run rejected to keep cash non-negative",
        ));
    }
    let closed = ledger
        .position
        .take()
        .expect("position was checked before charge calculation");
    *ledger.cash = cash_after_sell;
    *ledger.total_charges += exit_charges.total();
    let trade = ledger
        .trades
        .last_mut()
        .ok_or_else(|| EngineError::new("open position has no matching trade record"))?;
    trade.exit_bar = Some(bar);
    trade.exit_price = Some(fill_price);
    trade.exit_reason = Some(reason);
    trade.exit_charges = Some(exit_charges);
    trade.net_profit = Some(
        turnover - exit_charges.total() - closed.entry_notional - closed.entry_charges.total(),
    );
    Ok(())
}

/// Chooses the first intrabar protective exit, giving a stop priority over a same-bar target.
///
/// Example: if low touches the stop and high touches the target, this returns the stop price.
fn protective_exit(
    open: f64,
    low: f64,
    high: f64,
    position: &Position,
    slippage_fraction: f64,
) -> Option<(f64, ExitReason)> {
    let stop_hit = position.stop_price.is_some_and(|stop| low <= stop);
    let target_hit = position.target_price.is_some_and(|target| high >= target);
    if stop_hit {
        let stop = position
            .stop_price
            .expect("stop_hit proves a stop price exists");
        let market_price = if open < stop { open } else { stop };
        Some((
            market_price * (1.0 - slippage_fraction),
            ExitReason::StopLoss,
        ))
    } else if target_hit {
        let target = position
            .target_price
            .expect("target_hit proves a target price exists");
        Some((open.max(target), ExitReason::TakeProfit))
    } else {
        None
    }
}

/// Rejects invalid portfolio and slippage assumptions before a run modifies cash.
///
/// Example: a zero initial capital returns an error rather than producing undefined returns.
fn validate_config(config: &StrategyConfig) -> EngineResult<()> {
    if !config.initial_capital.is_finite() || config.initial_capital <= 0.0 {
        return Err(EngineError::new(
            "initial capital must be finite and greater than zero",
        ));
    }
    if !config.slippage_pct.is_finite() || !(0.0..100.0).contains(&config.slippage_pct) {
        return Err(EngineError::new(
            "slippage_pct must be finite and in 0..100",
        ));
    }
    if !config.risk_free_rate.is_finite() || config.trading_days_per_year == 0 {
        return Err(EngineError::new(
            "metric configuration must be finite with a positive trading-day count",
        ));
    }
    Ok(())
}
