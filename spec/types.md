<!-- Purpose: defines graph value types and indicator semantics. Connects: compiler type checking to engine signal calculation. -->
# Types

`Series` is one number per bar (`NaN` while an indicator warms up). `BoolSeries` is true or false per bar (false while warming up). `Number` is one constant. A `Number` used where a `Series` is expected is repeated for every bar. A `Series` never plugs into a `BoolSeries` input, and a `BoolSeries` never plugs into a `Series` input. Every required input must be connected.

Indicators:

- SMA is the rolling mean. It is first valid at index `period - 1`.
- EMA uses `alpha = 2/(period+1)`, seeded with the SMA of the first `period` values. It is first valid at index `period - 1`.
- RSI uses Wilder smoothing, seeded with the simple average of the first `period` gains and losses. It is first valid at index `period`. If average loss is 0, RSI is 100; if average gain and average loss are both 0, RSI is 50.

Any comparison involving `NaN` is false. `CROSSES_ABOVE` at bar `t` means `a[t-1] <= b[t-1]` and `a[t] > b[t]`; `CROSSES_BELOW` is the mirror. Either crossover is false unless both `a` and `b` are valid at both bar `t-1` and bar `t`.

`DELAY(n)` outputs `NaN` (or false for `BoolSeries`) for the first `n` bars.

