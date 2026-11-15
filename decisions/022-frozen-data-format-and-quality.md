<!-- Purpose: records how downloaded daily history becomes frozen AGT1 files. Connects: yfinance data to the engine's required price format. -->
# 022: Frozen data format and quality checks

## Context (plain words)
AlgoTrace needs repeatable daily prices for one-time educational backtests. The engine accepts the AGT1 format and rejects invalid input bars.

## Options considered
- Save provider CSV files and parse them at runtime.
- Download once, adjust daily OHLC together, validate rows, and freeze AGT1 binaries.
- Fill gaps with interpolated or copied prices.

## Decision
Use yfinance once for the named NIFTY 50 index and 15 requested stocks, from 2010-01-01 through the latest available date. Set `auto_adjust=True` so open, high, low, and close are adjusted consistently. Store daily session dates as UTC-midnight Unix seconds and write one six-column AGT1 file per symbol.

The downloader reports missing weekdays as candidates, drops invalid rows, and keeps the last valid observation for a duplicate date. It never invents prices to fill an absent day. Weekday gaps cannot be classified as holidays versus source omissions without an NSE holiday calendar.

## Why (beginner level)
The engine gets the exact byte layout it already understands. Saving the data once means a demo can use the same prices later, and the quality report makes imperfect source data visible.

## Trade-offs
Adjusted OHLC is internally consistent for split/dividend history, but provider corrections can change a later snapshot. The dataset can have unclassified weekday gaps. Current large-company constituents create survivorship bias. Re-running the script replaces the frozen snapshot.

## Interview answer (30 seconds)
I download adjusted daily data once, validate every row against the engine's input rules, and save each ticker as AGT1. I report missing weekdays instead of making up bars because they may be exchange holidays. The dataset is educational and has survivorship bias because it uses today's large companies.
