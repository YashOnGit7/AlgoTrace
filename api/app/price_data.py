"""Purpose: reads and writes validated AGT1 daily-price files. Connects: frozen files to the API and downloader."""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Iterable

HEADER = struct.Struct("<4sI8s")
DOUBLE = struct.Struct("<d")
MAGIC = b"AGT1"
FIELD_COUNT = 6
HEADER_SIZE = HEADER.size


@dataclass(frozen=True)
class PriceBar:
    """Stores one daily OHLCV bar with a UTC Unix timestamp.

    Example: `PriceBar(utc_midnight(date(2025, 1, 2)), 10, 12, 9, 11, 0)`.
    """

    timestamp: float
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class QualityReport:
    """Collects rows changed or suspected missing during one download.

    Example: `report.invalid_rows` lists source rows omitted before writing.
    """

    duplicate_dates: tuple[str, ...]
    invalid_rows: tuple[str, ...]
    missing_weekdays: tuple[str, ...]


def utc_midnight(day: date) -> int:
    """Turns a market calendar date into seconds at UTC midnight.

    Example: `utc_midnight(date(1970, 1, 2))` returns `86400`.
    """
    return int(datetime.combine(day, time.min, tzinfo=timezone.utc).timestamp())


def date_from_timestamp(timestamp: float) -> date:
    """Reads the UTC calendar day represented by a stored bar timestamp.

    Example: `date_from_timestamp(86400)` returns `date(1970, 1, 2)`.
    """
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).date()


def _bar_problem(bar: PriceBar) -> str | None:
    """Returns the first price-format problem found in a bar, if any.

    Example: `_bar_problem(PriceBar(0, 1, 2, 0, 1, 0))` returns a low-price error.
    """
    values = (bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume)
    if not all(math.isfinite(value) for value in values):
        return "contains a non-finite OHLCV value"
    if any(value <= 0 for value in (bar.open, bar.high, bar.low, bar.close)):
        return "contains a non-positive OHLC price"
    if bar.high < bar.low:
        return "has high below low"
    if bar.volume < 0:
        return "has negative volume"
    return None


def clean_downloaded_bars(bars: Iterable[PriceBar]) -> tuple[list[PriceBar], QualityReport]:
    """Drops invalid rows, keeps the last valid duplicate, and reports weekday gaps.

    Example: `clean_downloaded_bars([bar])` returns that row and an empty report.
    """
    last_valid_by_timestamp: dict[int, PriceBar] = {}
    duplicate_dates: set[str] = set()
    seen_dates: set[str] = set()
    invalid_rows: list[str] = []

    for bar in bars:
        market_day = date_from_timestamp(bar.timestamp) if math.isfinite(bar.timestamp) else None
        label = market_day.isoformat() if market_day is not None else f"timestamp {bar.timestamp}"
        if market_day is not None:
            if label in seen_dates:
                duplicate_dates.add(label)
            seen_dates.add(label)
        problem = _bar_problem(bar)
        if problem is not None:
            invalid_rows.append(f"{label}: {problem}")
            continue
        # Keeping the latest valid row mirrors yfinance's final revision for a date.
        normalized_timestamp = float(utc_midnight(market_day)) if market_day is not None else bar.timestamp
        last_valid_by_timestamp[int(normalized_timestamp)] = PriceBar(
            normalized_timestamp,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.volume,
        )

    cleaned = [last_valid_by_timestamp[key] for key in sorted(last_valid_by_timestamp)]
    missing_weekdays: list[str] = []
    if len(cleaned) > 1:
        cursor = date_from_timestamp(cleaned[0].timestamp) + timedelta(days=1)
        last_day = date_from_timestamp(cleaned[-1].timestamp)
        while cursor < last_day:
            if cursor.weekday() < 5 and utc_midnight(cursor) not in last_valid_by_timestamp:
                missing_weekdays.append(cursor.isoformat())
            cursor += timedelta(days=1)

    report = QualityReport(
        duplicate_dates=tuple(sorted(duplicate_dates)),
        invalid_rows=tuple(invalid_rows),
        missing_weekdays=tuple(missing_weekdays),
    )
    return cleaned, report


def remove_junk_holiday_bars(
    stock_series: dict[str, list[PriceBar]],
) -> tuple[dict[str, list[PriceBar]], tuple[str, ...]]:
    """Removes shared zero-volume flat dates from every stock series that has them.

    Flatness compares high to low and open to close using a relative tolerance
    of 1e-9. A date is removed only when every supplied stock bar on that date
    has zero volume and is flat. Example: a one-ULP difference in a zero-volume
    flat bar is treated as rounding noise when it is within that tolerance.
    """
    bars_by_timestamp: dict[int, list[PriceBar]] = {}
    for bars in stock_series.values():
        for bar in bars:
            bars_by_timestamp.setdefault(int(bar.timestamp), []).append(bar)

    junk_timestamps = {
        timestamp
        for timestamp, bars in bars_by_timestamp.items()
        if all(bar.volume == 0 and _is_flat_bar(bar) for bar in bars)
    }
    cleaned = {
        symbol: [bar for bar in bars if int(bar.timestamp) not in junk_timestamps]
        for symbol, bars in stock_series.items()
    }
    junk_dates = tuple(
        date_from_timestamp(timestamp).isoformat() for timestamp in sorted(junk_timestamps)
    )
    return cleaned, junk_dates


def _is_flat_bar(bar: PriceBar) -> bool:
    """Checks high-low and open-close differences against relative tolerance 1e-9."""
    high_low_scale = max(abs(bar.high), abs(bar.low))
    open_close_scale = max(abs(bar.open), abs(bar.close))
    return (
        abs(bar.high - bar.low) <= 1e-9 * high_low_scale
        and abs(bar.open - bar.close) <= 1e-9 * open_close_scale
    )


def encode_price_file(bars: Iterable[PriceBar]) -> bytes:
    """Encodes bars into the spec's header and six column-major f64 arrays.

    Example: `encode_price_file([bar])` starts with the bytes `AGT1`.
    """
    rows = list(bars)
    if len(rows) > 0xFFFFFFFF:
        raise ValueError("The AGT1 bar count exceeds the u32 header limit.")
    previous_timestamp: int | None = None
    for index, bar in enumerate(rows):
        problem = _bar_problem(bar)
        if problem is not None:
            raise ValueError(f"Bar {index} {problem}.")
        if previous_timestamp is not None and bar.timestamp <= previous_timestamp:
            raise ValueError("Timestamps must be strictly increasing.")
        previous_timestamp = bar.timestamp

    output = bytearray(HEADER.pack(MAGIC, len(rows), bytes(8)))
    columns = (
        (bar.timestamp for bar in rows),
        (bar.open for bar in rows),
        (bar.high for bar in rows),
        (bar.low for bar in rows),
        (bar.close for bar in rows),
        (bar.volume for bar in rows),
    )
    for column in columns:
        for value in column:
            output.extend(DOUBLE.pack(float(value)))
    return bytes(output)


def decode_price_file(data: bytes) -> list[PriceBar]:
    """Validates AGT1 bytes and reconstructs their daily rows.

    Example: `decode_price_file(encode_price_file([bar]))` returns `[bar]`.
    """
    if len(data) < HEADER_SIZE:
        raise ValueError("The AGT1 file is shorter than its 16-byte header.")
    magic, count, _reserved = HEADER.unpack_from(data)
    if magic != MAGIC:
        raise ValueError("The price file magic must be AGT1.")
    expected_size = HEADER_SIZE + FIELD_COUNT * count * DOUBLE.size
    if len(data) != expected_size:
        raise ValueError(f"The AGT1 file has {len(data)} bytes; expected {expected_size}.")

    columns: list[list[float]] = []
    for column_index in range(FIELD_COUNT):
        column_start = HEADER_SIZE + column_index * count * DOUBLE.size
        columns.append(
            [DOUBLE.unpack_from(data, column_start + row_index * DOUBLE.size)[0] for row_index in range(count)]
        )

    bars = [
        PriceBar(
            timestamp=columns[0][index],
            open=columns[1][index],
            high=columns[2][index],
            low=columns[3][index],
            close=columns[4][index],
            volume=columns[5][index],
        )
        for index in range(count)
    ]
    for index, bar in enumerate(bars):
        problem = _bar_problem(bar)
        if problem is not None:
            raise ValueError(f"Bar {index} {problem}.")
        if index > 0 and bar.timestamp <= bars[index - 1].timestamp:
            raise ValueError("Timestamps must be strictly increasing.")
    return bars


def filter_price_file(data: bytes, start: date | None, end: date | None) -> bytes:
    """Returns a validated AGT1 file limited to inclusive UTC dates.

    Example: `filter_price_file(data, date(2025, 1, 1), None)` keeps bars from Jan 1 onward.
    """
    selected = [
        bar
        for bar in decode_price_file(data)
        if (start is None or date_from_timestamp(bar.timestamp) >= start)
        and (end is None or date_from_timestamp(bar.timestamp) <= end)
    ]
    return encode_price_file(selected)


def symbol_filename(symbol: str) -> str:
    """Maps one supported market symbol to its safe frozen-data filename.

    Example: `symbol_filename("^NSEI")` returns `NIFTY_50.agt1`.
    """
    if symbol == "^NSEI":
        return "NIFTY_50.agt1"
    if symbol.endswith(".NS") and symbol[:-3].isalnum():
        return f"{symbol[:-3]}.agt1"
    raise KeyError(symbol)


def available_symbols(data_dir: Path) -> list[str]:
    """Lists supported symbols whose binary files are present.

    Example: `available_symbols(Path("data"))` returns only shipped datasets.
    """
    symbols = ["^NSEI"] + [
        "RELIANCE.NS",
        "TCS.NS",
        "HDFCBANK.NS",
        "INFY.NS",
        "ICICIBANK.NS",
        "ITC.NS",
        "SBIN.NS",
        "LT.NS",
        "BHARTIARTL.NS",
        "HINDUNILVR.NS",
        "AXISBANK.NS",
        "KOTAKBANK.NS",
        "MARUTI.NS",
        "SUNPHARMA.NS",
        "ASIANPAINT.NS",
    ]
    return [symbol for symbol in symbols if (data_dir / symbol_filename(symbol)).is_file()]
