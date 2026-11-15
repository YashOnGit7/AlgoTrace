<!-- Purpose: defines reproducible removal of zero-volume flat stock bars. Connects: yfinance source quality checks to frozen stock files. -->
# 026: Remove zero-volume flat stock bars

## Context (plain words)
The downloaded stock history contains junk holiday rows with zero volume. Floating-point storage can leave tiny differences in a row that is otherwise flat, so direct equality checks can miss these rows.

## Options considered
- Require exact equality for all four OHLC prices.
- Use a small relative tolerance for flatness and remove a date only when every stock file containing it has a zero-volume flat bar.
- Remove all zero-volume bars, even when their prices move.

## Decision
The downloader applies this rule across all downloaded stock series (not the index). A bar is flat when both `abs(high - low) <= 1e-9 * max(abs(high), abs(low))` and `abs(open - close) <= 1e-9 * max(abs(open), abs(close))`. A date is a junk holiday date only when every stock file that has a bar on that date has volume exactly zero and the bar passes both flatness checks. Remove that date from every stock file that contains it. Leave zero-volume bars with meaningful price movement and dates with any nonzero-volume stock bar untouched. The current frozen data scan identified 2014-10-15; previous cleanup had already removed 2014-04-24 and 2026-01-15, which also meet this rule.

## Why (beginner level)
Prices are floating-point numbers, and calculations can leave a tiny difference even when the source intended one flat price. Relative tolerance ignores that tiny noise. Requiring every stock that has the date to show zero volume and a flat price range avoids deleting a date when another stock shows real activity.

## Trade-offs
This catches flat holiday placeholders consistently when the downloader is rerun, but it can remove a legitimate date only if every available stock has no trades and remains flat within the stated tolerance. The exact threshold and all-stock condition make that choice repeatable and testable.

## Interview answer (30 seconds)
I remove a stock date only when every stock file containing that date has zero volume and is flat within a relative tolerance of 1e-9. That handles floating-point noise without removing a zero-volume bar that has a real price range. The rule runs automatically before the AGT1 files are written.
