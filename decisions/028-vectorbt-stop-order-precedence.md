<!-- Purpose: records measured vectorbt differences in the phase-2 reference comparisons. Connects: vectorbt portfolio execution to the Rust simulator rules. -->
# 028: Vectorbt stop and scheduled-exit precedence difference

**Status: ACCEPTED**

## Context (plain words)
The reference check ran SMA crossover, RSI oversold/overbought, and close-above/below-SMA with a 10% stop on RELIANCE.NS, TCS.NS, and SBIN.NS. Both tools received the same signals defined from `/spec`, with next-open fills, zero costs, zero slippage, 100% position sizing, and whole shares. Eight of the nine full-history comparisons matched. One SBIN.NS stop-strategy trade differed on 2020-03-02.

## Options considered
- Treat vectorbt's stop fill as authoritative and change the engine's behavior.
- Keep the engine behavior and explain vectorbt's different same-bar event priority.
- Relax the price and equity tolerance to hide the mismatch.

## Decision
Keep the engine behavior unchanged. Accepted spec rule G15 now states that scheduled orders fill at the open before stops and targets are checked. The comparison keeps its strict `1e-6` relative tolerance. vectorbt's built-in stop processing still applies the stop when that same bar's low reaches the stop level, before completing the signal exit. A brief check with a per-bar `sl_stop` array set to `NaN` on scheduled-exit bars did not disable the stop; vectorbt still produced the stop fill. We did not add a custom callback or other workaround. The SBIN stop comparison is therefore a named exception and is checked only through the bar before the overlap.

Measured SBIN.NS trade (zero-based trade index 128): entered 2020-02-19 at Rs 292.12591227233435 with 812 shares. On 2020-02-28, the strategy exit signal was true, so both tools had an exit scheduled for the 2020-03-02 open. The 2020-03-02 bar was open Rs 281.8838663839738, high Rs 282.7902453755621, low Rs 257.45694149647136, close Rs 260.4933166503906. The 10% stop was Rs 262.91332104510093.

- Rust engine: signal exit at the open, Rs 281.8838663839738; exit reason `signal`.
- vectorbt 1.2.1: stop-market exit at Rs 262.91332104510093.
- Equity at the 2020-03-02 close: engine Rs 228917.01286380854; vectorbt Rs 213512.9300486438.
- Relative difference: 6.73% in exit price and 6.73% in equity, above the unchanged `1e-6` tolerance.

The eight other strategy/instrument pairs matched trade dates, share counts, trade prices and every daily equity value within the stated tolerance. In the SBIN stop case, trade dates, shares, prices and equity match through bar 2501; bar 2502 and later are excluded from parity comparison because this named vectorbt precedence difference begins there. The engine behavior is correct and unchanged; G15 resolves the spec precedence rule.

## Why (beginner level)
Both tools see the same exit signal and same daily price bar. The difference is which event they process first on the fill day: the engine closes at the already-scheduled open, while vectorbt sees that the later low touched the stop and uses the stop price. Those are two different fills, which produce different cash and equity.

## Trade-offs
Keeping the engine unchanged follows accepted rule G15. vectorbt's built-in stop logic cannot serve as an exact simulator yardstick for this overlapping event, so the reference runner names this one exception and stops the SBIN stop-strategy comparison before bar 2502. No workaround or tolerance change is applied.

## Interview answer (30 seconds)
Eight of nine vectorbt checks matched. One SBIN trade had both a scheduled next-open sell and a stop touched later that day. The engine executed the scheduled open exit first, while vectorbt's stop logic took priority. I recorded both fills and equity values, kept the strict tolerance, and made no engine changes.
