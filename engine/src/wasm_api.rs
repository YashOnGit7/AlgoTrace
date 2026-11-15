//! Purpose: exposes a small pointer-based backtest API to JavaScript through wasm-bindgen.
//! Connects: browser-owned price bytes and AST JSON to engine results and sweep summaries.

use std::cell::RefCell;

use wasm_bindgen::prelude::*;

use crate::data::read_price_file;
use crate::simulator::run_backtest as execute_backtest;
use crate::sweep::{run_sweep, SweepParameter};
use crate::types::{BacktestResult, ChargeBreakdown, ExitReason, StrategyAst, Trade};

thread_local! {
    // The byte vector owns the one browser-to-WASM copy and remains in place for each run.
    static PRICE_BUFFER: RefCell<Option<Vec<u8>>> = const { RefCell::new(None) };
    static BACKTEST_OUTPUT: RefCell<Option<ColumnarOutput>> = const { RefCell::new(None) };
}

/// Reserves zero-initialized WASM memory for one encoded AGT1 price file.
///
/// Example: JavaScript calls this with the AGT1 byte length, then writes those bytes at the returned pointer.
#[wasm_bindgen]
pub fn reserve_price_buffer(byte_length: u32) -> Result<u32, JsValue> {
    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(byte_length as usize)
        .map_err(|error| JsValue::from_str(&format!("could not reserve price memory: {error}")))?;
    bytes.resize(byte_length as usize, 0);
    let pointer = bytes.as_mut_ptr() as usize as u32;
    PRICE_BUFFER.with(|slot| *slot.borrow_mut() = Some(bytes));
    Ok(pointer)
}

/// Releases the engine-owned AGT1 byte vector so its allocation can be reused.
///
/// Example: after all strategy runs finish, JavaScript calls `free_price_buffer()` to release the input allocation.
#[wasm_bindgen]
pub fn free_price_buffer() {
    PRICE_BUFFER.with(|slot| {
        slot.borrow_mut().take();
    });
}

/// Parses an AST and backtests the already-reserved AGT1 bytes without copying the price arrays.
///
/// Example: `run_backtest(ast_json)` reads the price bytes in place and saves the resulting curve and trades.
#[wasm_bindgen]
pub fn run_backtest(ast_json: &str) -> Result<(), JsValue> {
    let ast: StrategyAst = serde_json::from_str(ast_json)
        .map_err(|error| JsValue::from_str(&format!("strategy AST JSON is invalid: {error}")))?;
    let output = PRICE_BUFFER.with(|slot| {
        let buffer = slot.borrow();
        let bytes = buffer
            .as_deref()
            .ok_or_else(|| JsValue::from_str("price buffer has not been reserved"))?;
        let prices = read_price_file(bytes).map_err(engine_error)?;
        execute_backtest(&ast, prices).map_err(engine_error)
    })?;
    let columns = ColumnarOutput::from_result(output)?;
    BACKTEST_OUTPUT.with(|slot| *slot.borrow_mut() = Some(columns));
    Ok(())
}

/// Returns the pointer to the most recent equity values as contiguous `f64` elements.
///
/// Example: JavaScript combines this pointer with `equity_len()` and a fresh `Float64Array` view.
#[wasm_bindgen]
pub fn equity_ptr() -> u32 {
    BACKTEST_OUTPUT.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(0, |output| output.equity.as_ptr() as usize as u32)
    })
}

/// Returns the number of daily equity values in the most recent backtest.
///
/// Example: `equity_len()` returns the number of input bars after a successful run.
#[wasm_bindgen]
pub fn equity_len() -> u32 {
    BACKTEST_OUTPUT.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(0, |output| output.equity.len() as u32)
    })
}

/// Returns how many column arrays are available from `trade_column_ptr`.
///
/// Example: JavaScript loops from zero to `trade_column_count()` to build its named trade views.
#[wasm_bindgen]
pub fn trade_column_count() -> u32 {
    TRADE_COLUMN_NAMES.len() as u32
}

/// Returns the pointer for a trade column, or zero when the column id is unknown or no run exists.
///
/// Example: column zero is `entry_bar`; its `f64` array has one item per trade.
#[wasm_bindgen]
pub fn trade_column_ptr(column: u32) -> u32 {
    BACKTEST_OUTPUT.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|output| output.trades.get(column as usize))
            .map_or(0, |values| values.as_ptr() as usize as u32)
    })
}

/// Returns the number of entries in one trade column, or zero for an unknown column.
///
/// Example: `trade_column_len(0)` equals the number of entry bars recorded in the result.
#[wasm_bindgen]
pub fn trade_column_len(column: u32) -> u32 {
    BACKTEST_OUTPUT.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|output| output.trades.get(column as usize))
            .map_or(0, |values| values.len() as u32)
    })
}

/// Returns the small JSON object containing the latest run's metrics.
///
/// Example: `metrics_json()` returns fields such as total return, Sharpe, drawdown, and charges.
#[wasm_bindgen]
pub fn metrics_json() -> String {
    BACKTEST_OUTPUT.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or_else(|| "{}".to_owned(), |output| output.metrics_json.clone())
    })
}

/// Releases stored equity and trade columns while retaining the reserved price bytes.
///
/// Example: after copying or charting a result, JavaScript calls `free_backtest_results()` before another run.
#[wasm_bindgen]
pub fn free_backtest_results() {
    BACKTEST_OUTPUT.with(|slot| {
        slot.borrow_mut().take();
    });
}

/// Runs one prepared strategy across candidate parameter values and returns JSON summaries.
///
/// Example: `run_sweep(ast, "fast", "period", "[5,10,15]")` returns one metrics object per period.
#[wasm_bindgen]
pub fn run_sweep_json(
    ast_json: &str,
    node_id: &str,
    parameter_name: &str,
    values_json: &str,
) -> Result<String, JsValue> {
    let ast: StrategyAst = serde_json::from_str(ast_json)
        .map_err(|error| JsValue::from_str(&format!("strategy AST JSON is invalid: {error}")))?;
    let values: Vec<f64> = serde_json::from_str(values_json)
        .map_err(|error| JsValue::from_str(&format!("sweep values JSON is invalid: {error}")))?;
    let points = PRICE_BUFFER.with(|slot| {
        let buffer = slot.borrow();
        let bytes = buffer
            .as_deref()
            .ok_or_else(|| JsValue::from_str("price buffer has not been reserved"))?;
        let prices = read_price_file(bytes).map_err(engine_error)?;
        run_sweep(
            &ast,
            prices,
            &SweepParameter {
                node_id: node_id.to_owned(),
                name: parameter_name.to_owned(),
                values,
            },
        )
        .map_err(engine_error)
    })?;
    serde_json::to_string(&points)
        .map_err(|error| JsValue::from_str(&format!("could not encode sweep metrics: {error}")))
}

/// Stable trade array order mirrored by the TypeScript wrapper.
const TRADE_COLUMN_NAMES: [&str; 21] = [
    "entry_bar",
    "exit_bar",
    "shares",
    "entry_price",
    "exit_price",
    "exit_reason_code",
    "entry_brokerage",
    "entry_stt",
    "entry_transaction",
    "entry_sebi",
    "entry_stamp_duty",
    "entry_gst",
    "entry_dp",
    "exit_brokerage",
    "exit_stt",
    "exit_transaction",
    "exit_sebi",
    "exit_stamp_duty",
    "exit_gst",
    "exit_dp",
    "net_profit",
];

/// Owns the result columns so JavaScript can read each one as a typed array.
struct ColumnarOutput {
    equity: Vec<f64>,
    trades: Vec<Vec<f64>>,
    metrics_json: String,
}

impl ColumnarOutput {
    /// Splits engine records into the exported column-by-column memory layout.
    ///
    /// Example: each trade column stores one value per trade, with NaN for absent exit fields on open trades.
    fn from_result(result: BacktestResult) -> Result<Self, JsValue> {
        let equity = result
            .equity_curve
            .iter()
            .map(|point| point.equity)
            .collect();
        let mut trades: Vec<Vec<f64>> = (0..TRADE_COLUMN_NAMES.len())
            .map(|_| Vec::with_capacity(result.trades.len()))
            .collect();
        for trade in &result.trades {
            push_trade_columns(&mut trades, trade);
        }
        let metrics_json = serde_json::to_string(&result.metrics)
            .map_err(|error| JsValue::from_str(&format!("could not encode metrics: {error}")))?;
        Ok(Self {
            equity,
            trades,
            metrics_json,
        })
    }
}

/// Appends one trade's fields in the fixed order documented by `TRADE_COLUMN_NAMES`.
///
/// Example: an open trade writes NaN into its exit bar, exit price, exit charges, and net profit.
fn push_trade_columns(columns: &mut [Vec<f64>], trade: &Trade) {
    let entry = trade.entry_charges;
    let exit = trade.exit_charges.unwrap_or(ChargeBreakdown {
        brokerage: f64::NAN,
        stt: f64::NAN,
        transaction: f64::NAN,
        sebi: f64::NAN,
        stamp_duty: f64::NAN,
        gst: f64::NAN,
        dp: f64::NAN,
    });
    let values = [
        trade.entry_bar as f64,
        trade.exit_bar.map_or(f64::NAN, |bar| bar as f64),
        trade.shares as f64,
        trade.entry_price,
        trade.exit_price.unwrap_or(f64::NAN),
        trade.exit_reason.map_or(0.0, exit_reason_code),
        entry.brokerage,
        entry.stt,
        entry.transaction,
        entry.sebi,
        entry.stamp_duty,
        entry.gst,
        entry.dp,
        exit.brokerage,
        exit.stt,
        exit.transaction,
        exit.sebi,
        exit.stamp_duty,
        exit.gst,
        exit.dp,
        trade.net_profit.unwrap_or(f64::NAN),
    ];
    for (column, value) in columns.iter_mut().zip(values) {
        column.push(value);
    }
}

/// Converts an engine error into a readable JavaScript exception.
///
/// Example: an invalid AGT1 header becomes an `Error` with the parser's message.
fn engine_error(error: crate::types::EngineError) -> JsValue {
    JsValue::from_str(&error.to_string())
}

/// Maps an exit reason to the numeric code documented for the trade columns.
///
/// Example: `ExitReason::TakeProfit` is represented by `3.0` in the exit-reason column.
fn exit_reason_code(reason: ExitReason) -> f64 {
    match reason {
        ExitReason::Signal => 1.0,
        ExitReason::StopLoss => 2.0,
        ExitReason::TakeProfit => 3.0,
        ExitReason::EndOfData => 4.0,
    }
}
