<!-- Purpose: records the compiler fuzzing dependency and v1 constant-fold limit. Connects: randomized graph tests to safe optimization. -->
# 034: Compiler fuzzing and constant folding

## Context (plain words)
The compiler needs randomized graph coverage and a constant-fold pass, but v1 has few operations that can be evaluated at compile time.

## Options considered
- Add fast-check and apply unlisted algebraic rewrites.
- Use fast-check for generated graphs and keep the optimizer within the defined node rules.

## Decision
Use the user-approved `fast-check` dev dependency to generate randomized small graphs and compare compiler acceptance with an independent checker. Keep a constant-fold pass in the pipeline; for current v1 rules it is a no-op because math/comparison with two Number values is AT-E010 and remaining operators consume series.

## Why (beginner level)
Random inputs help find combinations a hand-written test may miss. Rewriting strategy behavior using undocumented rules would make results hard to explain.

## Trade-offs
No v1 graph is simplified by constant folding; the explicit pass keeps a place for safe future rules if the specification adds foldable values.

## Interview answer (30 seconds)
I fuzzed a small graph subset with fast-check and checked it independently. I retained the optimization stage, but made it a documented no-op because the current specification has no safe constant-only expression that can reach the AST.
