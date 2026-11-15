//! Purpose: defines the shared market-data view, AST, engine errors, and result structures.
//! Connects: all engine modules through stable input, intermediate, and output types.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

/// Names one of the five price columns in an AGT1 file.
///
/// Example: `PriceField::Close` selects the daily closing price.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PriceField {
    Open,
    High,
    Low,
    Close,
    Volume,
}

/// Borrows an AGT1 byte buffer so callers do not allocate six copied price arrays.
///
/// Example: `let bars = data::read_price_file(&bytes)?; assert_eq!(bars.len(), 20);`
#[derive(Clone, Copy, Debug)]
pub struct PriceView<'a> {
    pub(crate) bytes: &'a [u8],
    pub(crate) bar_count: usize,
}

/// Identifies an operation in the compiler-produced strategy graph.
///
/// Example: `NodeOp::Sma` represents one moving-average node.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NodeOp {
    Price,
    Constant,
    Sma,
    Ema,
    Rsi,
    Add,
    Sub,
    Mul,
    Div,
    Delay,
    Gt,
    Lt,
    CrossesAbove,
    CrossesBelow,
    And,
    Or,
    Not,
    Strategy,
}

/// One node in dependency order, with input port names mapped to node ids.
///
/// Example: an SMA node can store `period: 3` in `params` and `input: prices_id` in `inputs`.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AstNode {
    pub id: String,
    pub op: NodeOp,
    #[serde(default)]
    pub params: BTreeMap<String, JsonValue>,
    #[serde(default)]
    pub inputs: BTreeMap<String, String>,
}

/// Supplies capital, slippage, fees, and metric assumptions for one backtest.
///
/// Example: `StrategyConfig { initial_capital: 100_000.0, ..Default::default() }` starts with one lakh rupees.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct StrategyConfig {
    #[serde(default)]
    pub cost_preset: CostPreset,
    #[serde(default)]
    pub force_close_at_end: bool,
    pub initial_capital: f64,
    #[serde(default = "default_risk_free_rate")]
    pub risk_free_rate: f64,
    pub slippage_pct: f64,
    #[serde(default = "default_trading_days")]
    pub trading_days_per_year: u32,
}

impl Default for StrategyConfig {
    /// Builds the specification's baseline configuration for simple tests and examples.
    ///
    /// Example: `let config = StrategyConfig::default(); assert_eq!(config.trading_days_per_year, 252);`
    fn default() -> Self {
        Self {
            initial_capital: 100_000.0,
            slippage_pct: 0.05,
            cost_preset: CostPreset::default(),
            force_close_at_end: false,
            risk_free_rate: default_risk_free_rate(),
            trading_days_per_year: default_trading_days(),
        }
    }
}

/// Contains the per-fill charge rates stored in the cost preset file.
///
/// Example: `CostPreset { stt_buy_pct: 0.1, ..Default::default() }` means 0.1 percent STT on buys.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct CostPreset {
    #[serde(default)]
    pub brokerage_flat: f64,
    #[serde(default)]
    pub brokerage_max_per_order: Option<f64>,
    #[serde(default)]
    pub brokerage_pct: f64,
    #[serde(default)]
    pub dp_sell_flat: f64,
    #[serde(default)]
    pub gst_pct: f64,
    #[serde(default)]
    pub sebi_pct: f64,
    #[serde(default)]
    pub stamp_buy_pct: f64,
    #[serde(default)]
    pub stt_buy_pct: f64,
    #[serde(default)]
    pub stt_sell_pct: f64,
    #[serde(default)]
    pub txn_pct: f64,
}

/// Holds the complete version-1 AST accepted by the engine.
///
/// Example: a strategy has `version: 1`, ordered `nodes`, and a `sink` naming its STRATEGY node.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct StrategyAst {
    pub version: u32,
    pub config: StrategyConfig,
    pub nodes: Vec<AstNode>,
    pub sink: String,
}

/// Identifies why a position was sold.
///
/// Example: a next-open exit signal records `ExitReason::Signal`.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExitReason {
    Signal,
    StopLoss,
    TakeProfit,
    EndOfData,
}

/// Breaks one fill's charges into the parts described by the cost specification.
///
/// Example: `charges.total()` adds STT, taxes, brokerage, and any sell-side DP charge.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
pub struct ChargeBreakdown {
    pub brokerage: f64,
    pub stt: f64,
    pub transaction: f64,
    pub sebi: f64,
    pub stamp_duty: f64,
    pub gst: f64,
    pub dp: f64,
}

impl ChargeBreakdown {
    /// Adds all fee components without rounding.
    ///
    /// Example: `ChargeBreakdown { dp: 15.34, ..Default::default() }.total()` returns `15.34`.
    pub fn total(self) -> f64 {
        self.brokerage
            + self.stt
            + self.transaction
            + self.sebi
            + self.stamp_duty
            + self.gst
            + self.dp
    }
}

/// Records one completed or still-open long position.
///
/// Example: an unfinished end-of-data position has `exit_bar: None` and `exit_reason: None`.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Trade {
    pub entry_bar: usize,
    pub exit_bar: Option<usize>,
    pub shares: u64,
    pub entry_price: f64,
    pub exit_price: Option<f64>,
    pub exit_reason: Option<ExitReason>,
    pub entry_charges: ChargeBreakdown,
    pub exit_charges: Option<ChargeBreakdown>,
    pub net_profit: Option<f64>,
}

/// Stores the portfolio valuation at one daily close.
///
/// Example: `point.equity` equals `point.cash + point.shares * close` for that bar.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct EquityPoint {
    pub bar: usize,
    pub cash: f64,
    pub shares: u64,
    pub equity: f64,
    pub buy_and_hold: f64,
}

/// Stores all required performance measurements; undefined values use `None` for JSON null.
///
/// Example: a strategy without any closed trades has `win_rate: None`.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Metrics {
    pub total_return: f64,
    pub cagr: f64,
    pub sharpe: Option<f64>,
    pub sortino: Option<f64>,
    pub max_drawdown: f64,
    pub max_drawdown_length: usize,
    pub trade_count: usize,
    pub win_rate: Option<f64>,
    pub profit_factor: Option<f64>,
    pub average_net_trade: Option<f64>,
    pub exposure: f64,
    pub total_charges: f64,
    pub buy_and_hold_return: f64,
}

/// Groups the full backtest output for the browser results screen.
///
/// Example: `result.trades` contains completed trades and may end with one open position.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct BacktestResult {
    pub trades: Vec<Trade>,
    pub equity_curve: Vec<EquityPoint>,
    pub metrics: Metrics,
}

/// Represents either numeric output or boolean output from one AST node.
///
/// Example: an RSI node produces `NodeValue::NumberSeries`; an entry node produces `BoolSeries`.
#[derive(Clone, Debug, PartialEq)]
pub enum NodeValue {
    Empty,
    Number(f64),
    NumberSeries(Vec<f64>),
    BoolSeries(Vec<bool>),
}

/// Borrows the strategy's entry and exit arrays from an evaluation workspace.
///
/// Example: `signals.entry[4]` tells whether the strategy entered on the close of bar four.
#[derive(Clone, Copy, Debug)]
pub struct EvaluatedSignals<'a> {
    pub entry: &'a [bool],
    pub exit: &'a [bool],
}

/// Returns an engine error with a message suitable for logs or a future UI adapter.
///
/// Example: `EngineError::new("unknown node id")` reports a malformed AST input.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EngineError(pub String);

impl EngineError {
    /// Creates a readable engine error.
    ///
    /// Example: `EngineError::new("bad header")` keeps the reason attached to the failure.
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl std::fmt::Display for EngineError {
    /// Writes the engine error message for a terminal or API response.
    ///
    /// Example: formatting `EngineError::new("bad bar")` produces `bad bar`.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for EngineError {}

/// Result alias used by parsing, evaluation, simulation, and metrics code.
///
/// Example: `EngineResult<usize>` can return a checked bar index or an `EngineError`.
pub type EngineResult<T> = Result<T, EngineError>;

/// Returns the annual risk-free rate as a decimal fraction.
///
/// Example: `default_risk_free_rate()` returns `0.06` for six percent.
fn default_risk_free_rate() -> f64 {
    0.06
}

/// Returns the annual trading-day count from the project specification.
///
/// Example: `default_trading_days()` returns `252`.
fn default_trading_days() -> u32 {
    252
}

impl<'a> PriceView<'a> {
    /// Returns the number of price bars borrowed by this view.
    ///
    /// Example: `view.len()` is `20` for a twenty-bar fixture.
    pub fn len(self) -> usize {
        self.bar_count
    }

    /// Tells whether this price view contains no bars.
    ///
    /// Example: `view.is_empty()` is true for a valid header with a zero bar count.
    pub fn is_empty(self) -> bool {
        self.bar_count == 0
    }

    /// Returns one value from a selected column without copying the whole array.
    ///
    /// Example: `view.value(PriceField::Close, 0)` reads the first close from the backing bytes.
    pub fn value(self, field: PriceField, index: usize) -> EngineResult<f64> {
        if index >= self.bar_count {
            return Err(EngineError::new("price index is out of range"));
        }
        let column = match field {
            PriceField::Open => 1,
            PriceField::High => 2,
            PriceField::Low => 3,
            PriceField::Close => 4,
            PriceField::Volume => 5,
        };
        let byte_offset = 16 + (column * self.bar_count + index) * 8;
        let bytes: [u8; 8] = self.bytes[byte_offset..byte_offset + 8]
            .try_into()
            .expect("validated price view has complete f64 values");
        Ok(f64::from_le_bytes(bytes))
    }

    /// Returns a timestamp in Unix seconds from the first AGT1 array.
    ///
    /// Example: `view.timestamp(0)` reads the first daily bar's timestamp.
    pub fn timestamp(self, index: usize) -> EngineResult<f64> {
        if index >= self.bar_count {
            return Err(EngineError::new("timestamp index is out of range"));
        }
        let byte_offset = 16 + index * 8;
        let bytes: [u8; 8] = self.bytes[byte_offset..byte_offset + 8]
            .try_into()
            .expect("validated price view has complete timestamp values");
        Ok(f64::from_le_bytes(bytes))
    }

    /// Returns the original borrowed bytes for zero-copy verification and diagnostics.
    ///
    /// Example: `view.backing_bytes().as_ptr()` is the same pointer as the caller's input slice.
    pub fn backing_bytes(self) -> &'a [u8] {
        self.bytes
    }
}
