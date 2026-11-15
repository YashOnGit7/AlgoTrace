<!-- Purpose: records FastAPI's role in serving binary price files. Connects: stored market data to browser downloads. -->
# 004: FastAPI serves binary data

## Context (plain words)
The browser engine needs daily price arrays in the specified binary format.

## Options considered
- Let FastAPI serve the frozen binary files.
- Run backtests on the FastAPI server.

## Decision
FastAPI serves binary price files; backtests run in the browser.

## Why (beginner level)
The API delivers data without moving the computation off the user's device.

## Trade-offs
The browser must parse the file and run the engine locally.

## Interview answer (30 seconds)
FastAPI is a small delivery layer for frozen data. The user's browser downloads the bytes and runs the backtest locally, matching the project architecture.

