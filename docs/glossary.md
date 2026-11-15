<!-- Purpose: defines project terms in beginner-friendly language. Connects: the brief, specifications, and implementation. -->

# Glossary

- **AGT1:** the four-byte label at the start of an AlgoTrace daily price file.
- **AST (abstract syntax tree):** a structured list of strategy operations that the engine can execute.
- **Bar:** one day's open, high, low, close, and volume values.
- **Boolean series:** one true/false value for each bar, such as an entry signal.
- **CAGR:** the yearly growth rate that would connect the starting value to the ending value.
- **Cash:** the uninvested money in the simulated account.
- **Close:** the last recorded price for a bar.
- **Crossover:** the point where one series moves from one side of another to the other side.
- **Drawdown:** the percentage fall from a previous account-value high.
- **EMA (exponential moving average):** a moving average that gives more weight to recent prices.
- **Equity curve:** the account value recorded for each bar.
- **Exposure:** the share of bars during which the account held a position.
- **Fill:** the price and time at which an order becomes a trade.
- **High / low:** the highest and lowest prices reached during a bar.
- **Look-ahead bias:** using information that would not have been available when a trade was placed.
- **Little-endian:** a byte order that stores the least significant part of a number first.
- **NaN:** a special floating-point value meaning “not a number,” used here when a series is warming up or division is by zero.
- **Node:** one operation in a strategy graph, such as PRICE, SMA, or AND.
- **Open:** the first recorded price for a bar.
- **Price view:** a small reader that borrows the original price bytes and reads values only when needed.
- **RSI (relative strength index):** an indicator comparing recent average gains with recent average losses.
- **Series:** one numeric value for each daily bar.
- **Sharpe ratio:** average return above the risk-free assumption divided by return variability, then annualized.
- **Slippage:** the difference applied between a quoted open and the price used for a simulated fill.
- **SMA (simple moving average):** the average of the most recent fixed number of prices.
- **Sortino ratio:** a return score that compares average return with downside variability.
- **Stop-loss:** an exit price intended to limit a loss.
- **Take-profit:** an exit price intended to secure a gain.
- **Turnover:** the total rupee value of shares bought or sold in one fill.
- **Whole shares:** an integer number of shares; the engine does not buy fractions.
- **Wilder smoothing:** a running average used by RSI that gradually incorporates each new price change.
- **Sweep:** rerunning one strategy with several parameter values to compare their metrics.
- **WebAssembly (WASM):** a compact program format that can run inside a browser, using a linear memory area shared with JavaScript.
- **Linear memory:** the byte-addressed memory area a WebAssembly module reads and writes.
- **Typed-array view:** a JavaScript object that interprets part of an `ArrayBuffer` as numbers without copying those bytes.
- **Zero-copy (price input):** AlgoTrace copies encoded prices into WASM memory once, then Rust reads that stored data in place; it does not mean the browser-to-WASM transfer is free of a copy.
- **Columnar data:** a layout that stores each trade field in its own contiguous array, such as all entry prices in one array.
- **WASM memory growth:** expanding WebAssembly linear memory can replace its JavaScript `ArrayBuffer`, making older typed-array views stale; create new views from the current buffer afterward.
- **Volume:** the number of shares traded during a bar.

