<!-- Purpose: records deterministic validation failure behavior. Connects: compiler pass errors to stable UI diagnostics. -->
# 031: Compiler diagnostic precedence

## Context (plain words)
A graph can contain several mistakes, and later checks may not make sense until its structure is sound.

## Options considered
- Continue every pass and mix all messages together.
- Return all errors from the earliest failing pass and stop before later passes.

## Decision
The compiler reports all errors in the earliest failing stage, stops before later stages, and sorts errors by stage, code, then node id. IDs use plain string ordering for stable results.

## Why (beginner level)
Showing related issues together helps a beginner fix the structure before seeing confusing downstream errors. Stable sorting keeps the same graph's messages in the same order.

## Trade-offs
A user fixes one stage at a time; errors hidden in later stages appear after the earlier stage is clean.

## Interview answer (30 seconds)
The compiler stops at the first stage with errors but shows every error from that stage. It uses a fixed sort order so repeated runs produce the same diagnostics.
