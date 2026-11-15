"""Purpose: compares vectorbt portfolios with Rust/WASM for three identical strategy graphs.
Connects: frozen AGT1 files, spec-defined signals, vectorbt, and engine result columns.
"""

from __future__ import annotations

import argparse
import json
import struct
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import vectorbt as vbt

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPOSITORY_ROOT / "data"
ENGINE_BRIDGE = REPOSITORY_ROOT / "reference" / "scripts" / "run_engine_wasm.mjs"
TRADE_COLUMN_NAMES = (
    "entry_bar", "exit_bar", "shares", "entry_price", "exit_price", "exit_reason_code",
    "entry_brokerage", "entry_stt", "entry_transaction", "entry_sebi", "entry_stamp_duty",
    "entry_gst", "entry_dp", "exit_brokerage", "exit_stt", "exit_transaction", "exit_sebi",
    "exit_stamp_duty", "exit_gst", "exit_dp", "net_profit",
)
INITIAL_CAPITAL = 100_000.0
POSITION_SIZE_PERCENT = 100
RELATIVE_TOLERANCE = 1e-6
KNOWN_VECTORBT_EXCEPTION = {
    ("SBIN.NS", "price_above_sma_stop"): {
        "name": "scheduled_signal_exit_vs_intrabar_stop",
        "bar": 2502,
        "date": "2020-03-02",
    },
}
ZERO_COST_PRESET = {
    "brokerage_flat": 0.0,
    "brokerage_pct": 0.0,
    "brokerage_max_per_order": None,
    "dp_sell_flat": 0.0,
    "gst_pct": 0.0,
    "sebi_pct": 0.0,
    "stamp_buy_pct": 0.0,
    "stt_buy_pct": 0.0,
    "stt_sell_pct": 0.0,
    "txn_pct": 0.0,
}


@dataclass(frozen=True)
class PriceData:
    """Holds read-only daily OHLCV arrays and their matching date index.

    Example: `load_agt1(Path("data/RELIANCE.agt1")).close` reads adjusted closes.
    """

    timestamp: np.ndarray
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray
    volume: np.ndarray
    dates: pd.DatetimeIndex


@dataclass(frozen=True)
class StrategyDefinition:
    """Bundles one exact signal recipe with its engine AST and optional stop.

    Example: `make_strategy("sma_crossover")` creates matching Python signals and AST nodes.
    """

    name: str
    ast: dict[str, Any]
    entry: np.ndarray
    exit: np.ndarray
    stop_loss_pct: float | None


def load_agt1(path: Path) -> PriceData:
    """Reads the six column-major arrays from a validated frozen AGT1 file.

    Example: `load_agt1(DATA_DIR / "TCS.agt1").dates[0]` returns the first UTC date.
    """
    contents = path.read_bytes()
    if len(contents) < 16:
        raise ValueError(f"{path} is shorter than the AGT1 header.")
    magic, count, _reserved = struct.unpack_from("<4sI8s", contents)
    if magic != b"AGT1" or len(contents) != 16 + 6 * count * 8:
        raise ValueError(f"{path} does not have the expected AGT1 size and header.")
    columns = [
        np.frombuffer(contents, dtype="<f8", count=count, offset=16 + column * count * 8)
        for column in range(6)
    ]
    dates = pd.to_datetime(columns[0], unit="s", utc=True)
    return PriceData(*columns, dates=pd.DatetimeIndex(dates))


def sma_spec(values: np.ndarray, period: int) -> np.ndarray:
    """Computes the spec's rolling SMA with NaN for its initial warm-up bars.

    Example: `sma_spec(np.array([1., 2., 3.]), 2)` returns `[nan, 1.5, 2.5]`.
    """
    output = np.full(values.size, np.nan, dtype=np.float64)
    for index in range(period - 1, values.size):
        output[index] = sum(float(value) for value in values[index - period + 1 : index + 1]) / period
    return output


def rsi_spec(values: np.ndarray, period: int) -> np.ndarray:
    """Computes spec-seeded Wilder RSI, valid first at index `period`.

    Example: `rsi_spec(np.array([1., 2., 3.]), 2)[2]` equals 100 for two gains.
    """
    output = np.full(values.size, np.nan, dtype=np.float64)
    if values.size <= period:
        return output
    changes = np.diff(values)
    gains = np.maximum(changes, 0.0)
    losses = np.maximum(-changes, 0.0)
    average_gain = sum(float(value) for value in gains[:period]) / period
    average_loss = sum(float(value) for value in losses[:period]) / period
    output[period] = _rsi_value(average_gain, average_loss)
    for index in range(period + 1, values.size):
        change_index = index - 1
        average_gain = (average_gain * (period - 1) + gains[change_index]) / period
        average_loss = (average_loss * (period - 1) + losses[change_index]) / period
        output[index] = _rsi_value(average_gain, average_loss)
    return output


def _rsi_value(average_gain: float, average_loss: float) -> float:
    """Maps Wilder averages to RSI, including the spec's flat-series value.

    Example: `_rsi_value(0.0, 0.0)` returns 50.0.
    """
    if average_gain == 0.0 and average_loss == 0.0:
        return 50.0
    if average_loss == 0.0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + average_gain / average_loss)


def crosses_above(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    """Returns spec crossover flags, false unless both values are valid on both bars.

    Example: `crosses_above(np.array([1., 3.]), np.array([2., 2.]))` is true on bar one.
    """
    output = np.zeros(left.size, dtype=np.bool_)
    valid = np.isfinite(left[1:]) & np.isfinite(right[1:]) & np.isfinite(left[:-1]) & np.isfinite(right[:-1])
    output[1:] = valid & (left[:-1] <= right[:-1]) & (left[1:] > right[1:])
    return output


def crosses_below(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    """Returns spec cross-below flags with the same four-value validity rule.

    Example: `crosses_below(np.array([3., 1.]), np.array([2., 2.]))` is true on bar one.
    """
    output = np.zeros(left.size, dtype=np.bool_)
    valid = np.isfinite(left[1:]) & np.isfinite(right[1:]) & np.isfinite(left[:-1]) & np.isfinite(right[:-1])
    output[1:] = valid & (left[:-1] >= right[:-1]) & (left[1:] < right[1:])
    return output


def make_strategy(name: str, close: np.ndarray) -> StrategyDefinition:
    """Builds spec-defined signal arrays and the AST Rust evaluates independently.

    Example: `make_strategy("rsi_oversold", closes)` uses RSI(14), 30, and 70.
    """
    nodes: list[dict[str, Any]] = [{"id": "close", "op": "PRICE", "params": {"field": "close"}, "inputs": {}}]
    stop_loss_pct = None
    if name == "sma_crossover":
        nodes.extend([
            {"id": "fast", "op": "SMA", "params": {"period": 10}, "inputs": {"input": "close"}},
            {"id": "slow", "op": "SMA", "params": {"period": 30}, "inputs": {"input": "close"}},
            {"id": "entry", "op": "CROSSES_ABOVE", "params": {}, "inputs": {"a": "fast", "b": "slow"}},
            {"id": "exit", "op": "CROSSES_BELOW", "params": {}, "inputs": {"a": "fast", "b": "slow"}},
        ])
        entry = crosses_above(sma_spec(close, 10), sma_spec(close, 30))
        exit_signal = crosses_below(sma_spec(close, 10), sma_spec(close, 30))
    elif name == "rsi_oversold_overbought":
        nodes.extend([
            {"id": "rsi", "op": "RSI", "params": {"period": 14}, "inputs": {"input": "close"}},
            {"id": "oversold", "op": "CONSTANT", "params": {"value": 30}, "inputs": {}},
            {"id": "overbought", "op": "CONSTANT", "params": {"value": 70}, "inputs": {}},
            {"id": "entry", "op": "CROSSES_BELOW", "params": {}, "inputs": {"a": "rsi", "b": "oversold"}},
            {"id": "exit", "op": "CROSSES_ABOVE", "params": {}, "inputs": {"a": "rsi", "b": "overbought"}},
        ])
        rsi = rsi_spec(close, 14)
        entry = crosses_below(rsi, np.full(close.size, 30.0))
        exit_signal = crosses_above(rsi, np.full(close.size, 70.0))
    elif name == "price_above_sma_stop":
        nodes.extend([
            {"id": "average", "op": "SMA", "params": {"period": 20}, "inputs": {"input": "close"}},
            {"id": "entry", "op": "GT", "params": {}, "inputs": {"a": "close", "b": "average"}},
            {"id": "exit", "op": "LT", "params": {}, "inputs": {"a": "close", "b": "average"}},
        ])
        average = sma_spec(close, 20)
        entry = np.isfinite(average) & (close > average)
        exit_signal = np.isfinite(average) & (close < average)
        stop_loss_pct = 10.0
    else:
        raise ValueError(f"unknown strategy {name!r}")

    parameters: dict[str, Any] = {"position_size_pct": POSITION_SIZE_PERCENT}
    if stop_loss_pct is not None:
        parameters["stop_loss_pct"] = stop_loss_pct
    nodes.append({"id": "strategy", "op": "STRATEGY", "params": parameters, "inputs": {"entry": "entry", "exit": "exit"}})
    ast = {
        "version": 1,
        "config": {
            "initial_capital": INITIAL_CAPITAL,
            "slippage_pct": 0.0,
            "cost_preset": ZERO_COST_PRESET,
            "force_close_at_end": False,
            "risk_free_rate": 0.06,
            "trading_days_per_year": 252,
        },
        "nodes": nodes,
        "sink": "strategy",
    }
    return StrategyDefinition(name, ast, entry, exit_signal, stop_loss_pct)


def run_vectorbt(prices: PriceData, strategy: StrategyDefinition) -> tuple[np.ndarray, list[dict[str, Any]], vbt.Portfolio]:
    """Runs signal arrays with open fills, whole shares, no costs, and long-only rules.

    Example: `run_vectorbt(prices, make_strategy("sma_crossover", prices.close))` returns daily equity.
    """
    close = pd.Series(prices.close, index=prices.dates, name="close")
    open_price = pd.Series(prices.open, index=prices.dates, name="open")
    kwargs: dict[str, Any] = {}
    if strategy.stop_loss_pct is not None:
        kwargs.update(
            open=pd.Series(prices.open, index=prices.dates),
            high=pd.Series(prices.high, index=prices.dates),
            low=pd.Series(prices.low, index=prices.dates),
            sl_stop=strategy.stop_loss_pct / 100.0,
            stop_entry_price=vbt.portfolio.enums.StopEntryPrice.FillPrice,
            stop_exit_price=vbt.portfolio.enums.StopExitPrice.StopMarket,
        )
    portfolio = vbt.Portfolio.from_signals(
        close,
        entries=pd.Series(strategy.entry, index=prices.dates).shift(1, fill_value=False),
        exits=pd.Series(strategy.exit, index=prices.dates).shift(1, fill_value=False),
        price=open_price,
        size=1.0,
        size_type=vbt.portfolio.enums.SizeType.Percent,
        size_granularity=1.0,
        direction=vbt.portfolio.enums.Direction.LongOnly,
        accumulate=False,
        upon_long_conflict=vbt.portfolio.enums.ConflictMode.Ignore,
        init_cash=INITIAL_CAPITAL,
        allow_partial=True,
        cash_sharing=False,
        fees=0.0,
        fixed_fees=0.0,
        slippage=0.0,
        use_stops=strategy.stop_loss_pct is not None,
        **kwargs,
        freq="1D",
    )
    equity = np.asarray(portfolio.value(), dtype=np.float64)
    trades: list[dict[str, Any]] = []
    for record in portfolio.trades.records.to_dict("records"):
        closed = record["status"] == vbt.portfolio.enums.TradeStatus.Closed
        trades.append({
            "entry_bar": int(record["entry_idx"]),
            "exit_bar": int(record["exit_idx"]) if closed else None,
            "shares": float(record["size"]),
            "entry_price": float(record["entry_price"]),
            "exit_price": float(record["exit_price"]) if closed else None,
        })
    return equity, trades, portfolio


def run_engine_wasm(price_path: Path, ast: dict[str, Any]) -> dict[str, Any]:
    """Calls the existing real-WASM bridge and parses its result JSON.

    Example: `run_engine_wasm(data_path, ast)["equity"]` returns one value per input bar.
    """
    completed = subprocess.run(
        ["node", str(ENGINE_BRIDGE), str(price_path), json.dumps(ast, separators=(",", ":"))],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"WASM engine bridge failed: {completed.stderr.strip()}")
    return json.loads(completed.stdout)


def relative_equal(left: float, right: float) -> bool:
    """Applies the agreed strict relative tolerance to finite prices and equity.

    Example: `relative_equal(100.0, 100.00001)` is true at 1e-6 relative tolerance.
    """
    return abs(left - right) <= RELATIVE_TOLERANCE * max(abs(left), abs(right), sys.float_info.min)


def compare_results(
    prices: PriceData,
    engine_result: dict[str, Any],
    vectorbt_equity: np.ndarray,
    vectorbt_trades: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Finds equity and trade mismatches without relaxing the requested tolerance.

    Example: `compare_results(data, rust, vbt_equity, vbt_trades)` returns an empty list on parity.
    """
    differences: list[dict[str, Any]] = []
    engine_equity = engine_result["equity"]
    if len(engine_equity) != len(vectorbt_equity):
        differences.append({"field": "equity_length", "engine": len(engine_equity), "vectorbt": len(vectorbt_equity)})
    else:
        for bar, (engine_value, vectorbt_value) in enumerate(zip(engine_equity, vectorbt_equity)):
            if not relative_equal(float(engine_value), float(vectorbt_value)):
                differences.append({
                    "field": "equity",
                    "bar": bar,
                    "date": prices.dates[bar].strftime("%Y-%m-%d"),
                    "engine": engine_value,
                    "vectorbt": float(vectorbt_value),
                })
                break

    engine_columns = engine_result["trades"]
    engine_trade_count = len(engine_columns["entry_bar"])
    if engine_trade_count != len(vectorbt_trades):
        first_bar = min(
            int(engine_columns["entry_bar"][-1]) if engine_trade_count else len(prices.dates) - 1,
            vectorbt_trades[-1]["entry_bar"] if vectorbt_trades else len(prices.dates) - 1,
        )
        differences.append({
            "field": "trade_count",
            "bar": first_bar,
            "date": prices.dates[first_bar].strftime("%Y-%m-%d"),
            "engine": engine_trade_count,
            "vectorbt": len(vectorbt_trades),
        })
    else:
        for trade_index, vector_trade in enumerate(vectorbt_trades):
            engine_entry = int(engine_columns["entry_bar"][trade_index])
            engine_exit_raw = engine_columns["exit_bar"][trade_index]
            engine_exit = int(engine_exit_raw) if engine_exit_raw is not None else None
            engine_shares = int(engine_columns["shares"][trade_index])
            for field, left, right, bar in (
                ("entry_date", prices.dates[engine_entry].strftime("%Y-%m-%d"), prices.dates[vector_trade["entry_bar"]].strftime("%Y-%m-%d"), min(engine_entry, vector_trade["entry_bar"])),
                ("exit_date", None if engine_exit is None else prices.dates[engine_exit].strftime("%Y-%m-%d"), None if vector_trade["exit_bar"] is None else prices.dates[vector_trade["exit_bar"]].strftime("%Y-%m-%d"), engine_exit if engine_exit is not None else vector_trade["exit_bar"] or engine_entry),
                ("shares", engine_shares, vector_trade["shares"], engine_entry),
            ):
                if left != right:
                    differences.append({"field": f"trade_{field}", "trade": trade_index, "bar": bar, "date": prices.dates[bar].strftime("%Y-%m-%d"), "engine": left, "vectorbt": right})
                    break
            if differences and differences[-1].get("trade") == trade_index:
                break
            for field in ("entry_price", "exit_price"):
                left = engine_columns[field][trade_index]
                right = vector_trade[field]
                if left is None or right is None:
                    if left != right:
                        differences.append({"field": f"trade_{field}", "trade": trade_index, "bar": engine_entry, "date": prices.dates[engine_entry].strftime("%Y-%m-%d"), "engine": left, "vectorbt": right})
                        break
                elif not relative_equal(float(left), float(right)):
                    bar = engine_entry if field == "entry_price" else (engine_exit or engine_entry)
                    differences.append({"field": f"trade_{field}", "trade": trade_index, "bar": bar, "date": prices.dates[bar].strftime("%Y-%m-%d"), "engine": left, "vectorbt": right})
                    break
            if differences and differences[-1].get("trade") == trade_index:
                break
    return differences


def truncate_engine_result_before_bar(engine_result: dict[str, Any], end_bar: int) -> dict[str, Any]:
    """Keeps equity and trades only through the bar before a named exception.

    Example: `truncate_engine_result_before_bar(result, 3)` checks bars zero through two.
    """
    engine_columns = engine_result["trades"]
    kept = [index for index, bar in enumerate(engine_columns["entry_bar"]) if int(bar) < end_bar]
    trade_columns: dict[str, list[Any]] = {}
    exit_fields = {
        "exit_bar", "exit_price", "exit_brokerage", "exit_stt", "exit_transaction", "exit_sebi",
        "exit_stamp_duty", "exit_gst", "exit_dp", "net_profit",
    }
    for name, values in engine_columns.items():
        selected: list[Any] = []
        for index in kept:
            exit_bar = engine_columns["exit_bar"][index]
            still_open_at_end = exit_bar is None or int(exit_bar) >= end_bar
            if still_open_at_end and name in exit_fields:
                selected.append(None)
            elif still_open_at_end and name == "exit_reason_code":
                selected.append(0.0)
            else:
                selected.append(values[index])
        trade_columns[name] = selected
    return {"equity": engine_result["equity"][:end_bar], "trades": trade_columns}


def truncate_vectorbt_trades_before_bar(
    trades: list[dict[str, Any]], end_bar: int,
) -> list[dict[str, Any]]:
    """Treats vectorbt trades ending at or after the cutoff as open at the cutoff.

    Example: `truncate_vectorbt_trades_before_bar(trades, 3)` excludes an exit on bar three.
    """
    result = []
    for trade in trades:
        if trade["entry_bar"] >= end_bar:
            continue
        retained = dict(trade)
        if retained["exit_bar"] is None or retained["exit_bar"] >= end_bar:
            retained["exit_bar"] = None
            retained["exit_price"] = None
        result.append(retained)
    return result


def parse_args() -> argparse.Namespace:
    """Reads the requested full-history comparison instruments.

    Example: `python compare_vectorbt.py --symbols RELIANCE.NS,TCS.NS,SBIN.NS`.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbols", default="RELIANCE.NS,TCS.NS,SBIN.NS")
    return parser.parse_args()


def main() -> int:
    """Runs all three strategies on each requested full-history stock.

    Example: `main()` prints PASS lines for parity or detailed first differences per run.
    """
    args = parse_args()
    strategies = ("sma_crossover", "rsi_oversold_overbought", "price_above_sma_stop")
    symbols = [symbol.strip() for symbol in args.symbols.split(",") if symbol.strip()]
    all_differences = []
    named_exception_count = 0
    settings = {
        "initial_capital": INITIAL_CAPITAL,
        "size": 1.0,
        "size_type": "percent",
        "size_granularity": 1.0,
        "direction": "longonly",
        "accumulate": False,
        "allow_partial": True,
        "cash_sharing": False,
        "price": "next bar open (signals shifted by one bar)",
        "fees": 0.0,
        "fixed_fees": 0.0,
        "slippage": 0.0,
        "force_close_at_end": False,
        "upon_long_conflict": "ignore",
        "use_stops": "true for stop strategy only",
        "stop_configuration": {"sl_stop": 0.10, "stop_entry_price": "FillPrice", "stop_exit_price": "StopMarket"},
        "relative_tolerance": RELATIVE_TOLERANCE,
    }
    print(f"Python={sys.version.split()[0]} pandas={pd.__version__} vectorbt={vbt.__version__}")
    print("Vectorbt settings: " + json.dumps(settings, sort_keys=True))
    for symbol in symbols:
        if symbol == "^NSEI" or not symbol.endswith(".NS"):
            raise ValueError(f"unsupported reference stock symbol: {symbol}")
        price_path = DATA_DIR / f"{symbol[:-3]}.agt1"
        prices = load_agt1(price_path)
        for strategy_name in strategies:
            definition = make_strategy(strategy_name, prices.close)
            engine_result = run_engine_wasm(price_path, definition.ast)
            vectorbt_equity, vectorbt_trades, _portfolio = run_vectorbt(prices, definition)
            known_exception = KNOWN_VECTORBT_EXCEPTION.get((symbol, strategy_name))
            if known_exception is None:
                compared_engine = engine_result
                compared_equity = vectorbt_equity
                compared_trades = vectorbt_trades
            else:
                exception_bar = known_exception["bar"]
                actual_date = prices.dates[exception_bar].strftime("%Y-%m-%d")
                if actual_date != known_exception["date"]:
                    raise RuntimeError(
                        f"named vectorbt exception moved: expected {known_exception['date']} at bar "
                        f"{exception_bar}, found {actual_date}"
                    )
                compared_engine = truncate_engine_result_before_bar(engine_result, exception_bar)
                compared_equity = vectorbt_equity[:exception_bar]
                compared_trades = truncate_vectorbt_trades_before_bar(vectorbt_trades, exception_bar)
            differences = compare_results(prices, compared_engine, compared_equity, compared_trades)
            if differences:
                first = differences[0]
                explanation = explain_difference(strategy_name, first)
                print(f"DIFF {symbol} {strategy_name}: {json.dumps(first, sort_keys=True)}")
                print(f"  explanation: {explanation}")
                all_differences.append({"symbol": symbol, "strategy": strategy_name, "differences": differences, "explanation": explanation})
            elif known_exception is not None:
                named_exception_count += 1
                exception_bar = known_exception["bar"]
                engine_columns = engine_result["trades"]
                trade_index = next(
                    index for index, exit_bar in enumerate(engine_columns["exit_bar"])
                    if exit_bar is not None and int(exit_bar) == exception_bar
                )
                vector_trade = next(trade for trade in vectorbt_trades if trade["exit_bar"] == exception_bar)
                print(
                    f"PASS {symbol} {strategy_name} through bar {exception_bar - 1}: "
                    f"{exception_bar} bars checked; {len(compared_trades)} trades checked"
                )
                print(
                    f"EXCEPTION {symbol} {strategy_name} {known_exception['name']} "
                    f"bar={exception_bar} date={known_exception['date']} "
                    f"engine_exit={engine_columns['exit_price'][trade_index]} "
                    f"vectorbt_exit={vector_trade['exit_price']} "
                    f"engine_equity={engine_result['equity'][exception_bar]} "
                    f"vectorbt_equity={float(vectorbt_equity[exception_bar])}"
                )
            else:
                print(f"PASS {symbol} {strategy_name}: trades={len(vectorbt_trades)} bars={len(vectorbt_equity)}")
    if all_differences:
        print("SUMMARY " + json.dumps(all_differences, sort_keys=True))
        return 1
    if named_exception_count:
        print(f"PASS all comparisons within scope; {named_exception_count} named exception reported")
    else:
        print("PASS all requested strategy and stock comparisons")
    return 0


def explain_difference(strategy_name: str, difference: dict[str, Any]) -> str:
    """Provides a provisional rule-focused explanation for a mismatch.

    Example: a price-above-SMA stop mismatch on the entry bar points to stop timing.
    """
    if strategy_name == "price_above_sma_stop" and difference["field"] in ("equity", "trade_exit_date", "trade_exit_price"):
        return "A scheduled next-open signal exit and an intrabar stop both apply on this bar; vectorbt gives its built-in stop priority, while the engine processes the scheduled open exit first."
    if difference["field"] in ("trade_entry_date", "trade_exit_date", "trade_shares", "trade_count"):
        return "Inspect signal warm-up, next-open shifting, and whole-share sizing; these are required to match the spec exactly."
    return "Inspect the corresponding spec formula and vectorbt portfolio semantics; do not relax the 1e-6 relative tolerance."


if __name__ == "__main__":
    raise SystemExit(main())
