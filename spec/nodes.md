<!-- Purpose: lists supported graph node shapes and parameters. Connects: canvas graphs to compiler validation and AST operations. -->
# Node catalog (v1)

- `PRICE(field: open|high|low|close|volume) -> Series`
- `CONSTANT(value) -> Number`
- `SMA(period 2..500), EMA(period 2..500), RSI(period 2..200)`: input `Series` -> `Series`
- `ADD`, `SUB`, `MUL`, `DIV`: inputs `a`, `b` (`Series` or `Number`, at least one `Series`) -> `Series`. `DIV` by zero gives `NaN`.
- `DELAY(bars 1..50)`: input `Series` or `BoolSeries` -> same type, shifted later in time.
- `GT`, `LT`, `CROSSES_ABOVE`, `CROSSES_BELOW`: inputs `a`, `b` (`Series` or `Number`, at least one `Series`) -> `BoolSeries`.
- `AND`, `OR`: inputs `a`, `b` `BoolSeries` -> `BoolSeries`. `NOT`: input `BoolSeries` -> `BoolSeries`.
- `STRATEGY` (exactly one per graph): inputs `entry`, `exit` (`BoolSeries`); params `position_size_pct` (1..100, default 100), `stop_loss_pct` (optional, 0.1..50), `take_profit_pct` (optional, 0.1..500).

When `stop_loss_pct` or `take_profit_pct` is omitted, that feature is off. An out-of-range value is compiler error `AT-E007`.

All node parameters ending in `_pct` use percentage points (`0.1` means `0.1%`).

