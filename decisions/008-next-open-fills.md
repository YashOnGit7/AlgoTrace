<!-- Purpose: records signal-to-order timing. Connects: close-based signals to next-day open fills. -->
# 008: Signal on bar t fills at open of t+1

## Context (plain words)
A signal calculated with today's close cannot be filled using information from that same close without look-ahead.

## Options considered
- Fill at the same bar close.
- Fill at the next bar open.

## Decision
A signal at bar `t` creates an order for the open of bar `t+1`; no order is created from a signal on the final bar.

## Why (beginner level)
The next open happens after the close that produced the signal.

## Trade-offs
The fill price may differ from the close that triggered the signal.

## Interview answer (30 seconds)
Signals use data through today's close, so trades fill at the next open. This timing prevents the strategy from benefiting from a price it could not yet know.

