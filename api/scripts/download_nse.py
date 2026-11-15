"""Purpose: freezes the requested NSE daily history into AGT1 files. Connects: yfinance source data to /data."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import yfinance as yf

API_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = API_ROOT.parent
DATA_DIR = REPOSITORY_ROOT / "data"
START_DATE = date(2010, 1, 1)
SYMBOLS = (
    "^NSEI",
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
)

# Running a script by filename puts /api/scripts, not /api, at sys.path[0].
sys.path.insert(0, str(API_ROOT))

from app.price_data import (  # noqa: E402
    PriceBar,
    QualityReport,
    clean_downloaded_bars,
    date_from_timestamp,
    encode_price_file,
    remove_junk_holiday_bars,
    utc_midnight,
)


def filename_for(symbol: str) -> str:
    """Returns the stable local data filename for a Yahoo Finance symbol.

    Example: `filename_for("^NSEI")` returns `NIFTY_50.agt1`.
    """
    return "NIFTY_50.agt1" if symbol == "^NSEI" else f"{symbol.removesuffix('.NS')}.agt1"


def download_symbol(symbol: str) -> tuple[list[PriceBar], QualityReport]:
    """Downloads one adjusted daily series and cleans it before serialization.

    Example: `download_symbol("RELIANCE.NS")` returns checked bars and quality notes.
    """
    frame = yf.download(
        symbol,
        start=START_DATE.isoformat(),
        interval="1d",
        auto_adjust=True,
        actions=False,
        progress=False,
        threads=False,
        multi_level_index=False,
    )
    if frame.empty:
        raise RuntimeError(f"yfinance returned no daily rows for {symbol}.")

    source_bars: list[PriceBar] = []
    for source_date, row in frame.iterrows():
        # yfinance indexes daily bars by the exchange's local calendar date.
        market_day = source_date.date()
        source_bars.append(
            PriceBar(
                timestamp=utc_midnight(market_day),
                open=float(row["Open"]),
                high=float(row["High"]),
                low=float(row["Low"]),
                close=float(row["Close"]),
                volume=float(row["Volume"]),
            )
        )

    return clean_downloaded_bars(source_bars)


def main() -> int:
    """Downloads each configured ticker once and writes its validated AGT1 file.

    Example: `python api/scripts/download_nse.py` populates the repository's `/data` folder.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    downloaded: dict[str, tuple[list[PriceBar], QualityReport]] = {}
    for symbol in SYMBOLS:
        try:
            bars, report = download_symbol(symbol)
            if not bars:
                raise RuntimeError("all downloaded rows failed the price quality checks")
            downloaded[symbol] = (bars, report)
        except Exception as error:
            failures.append(f"{symbol}: {error}")
            print(f"ERROR {symbol}: {error}", file=sys.stderr)

    if failures:
        print(
            f"Completed with {len(failures)} failed symbol(s); no files were written, "
            "because the cross-stock holiday check needs every symbol.",
            file=sys.stderr,
        )
        return 1

    stock_bars = {symbol: downloaded[symbol][0] for symbol in SYMBOLS if symbol != "^NSEI"}
    cleaned_stocks, removed_dates = remove_junk_holiday_bars(stock_bars)
    for symbol, bars in cleaned_stocks.items():
        _, report = downloaded[symbol]
        _, refreshed_gaps = clean_downloaded_bars(bars)
        downloaded[symbol] = (
            bars,
            QualityReport(report.duplicate_dates, report.invalid_rows, refreshed_gaps.missing_weekdays),
        )
    if removed_dates:
        print("Removed shared zero-volume flat stock dates: " + ", ".join(removed_dates))

    for symbol in SYMBOLS:
        bars, report = downloaded[symbol]
        output_path = DATA_DIR / filename_for(symbol)
        output_path.write_bytes(encode_price_file(bars))
        missing_sample = ", ".join(report.missing_weekdays[:8]) or "none"
        if len(report.missing_weekdays) > 8:
            missing_sample += f", ... (+{len(report.missing_weekdays) - 8} more)"
        print(
            f"{symbol}: wrote {len(bars)} bars "
            f"({date_from_timestamp(bars[0].timestamp)}..{date_from_timestamp(bars[-1].timestamp)}); "
            f"dropped {len(report.invalid_rows)} invalid rows; "
            f"kept last valid row for {len(report.duplicate_dates)} duplicate dates; "
            f"missing weekdays {len(report.missing_weekdays)} [{missing_sample}] -> {output_path.name}"
        )
    print(f"Finished all {len(SYMBOLS)} symbols. yfinance={yf.__version__}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
