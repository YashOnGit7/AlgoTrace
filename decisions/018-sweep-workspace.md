<!-- Purpose: records how parameter sweeps reuse engine memory. Connects: repeated strategy runs to shared price data and reusable workspaces. -->
# 018: Reuse workspaces for parameter sweeps

## Context (plain words)
A parameter sweep runs the same strategy repeatedly with different parameter values. Recreating all arrays for every run wastes time and memory.

## Options considered
- Rebuild evaluation and simulation buffers for every parameter value.
- Keep one evaluation plan and reusable buffers, changing only the selected parameter and clearing result contents.

## Decision
Build the evaluation plan once, borrow the same price view for every run, and reuse series, trade, equity, and metric scratch buffers. Return only one compact metric record per sweep point.

## Why (beginner level)
The price file and output array sizes stay the same across runs, so their memory can be used again instead of repeatedly requested from the computer.

## Trade-offs
Reusable buffers make state management more explicit and must be cleared carefully between runs.

## Interview answer (30 seconds)
The sweep prepares the graph once and borrows one price view. Each iteration rewrites reusable buffers and stores only its requested metric summary, reducing repeated allocation.

