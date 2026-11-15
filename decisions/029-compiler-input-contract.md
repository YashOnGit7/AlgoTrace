<!-- Purpose: records the compiler's graph boundary. Connects: AI graph output and future canvas conversion to the public compiler API. -->
# 029: Compiler input contract

## Context (plain words)
The compiler needs a graph shape that can be checked without depending on the browser's canvas library.

## Options considered
- Accept React Flow node and edge objects directly.
- Accept the simple node and edge shape already defined in `/spec/ai-graph-format.md`.

## Decision
The only public compiler function is `compile(graph, config)`. Graph nodes contain `id`, `type`, and `params`; edges contain `from`, `to`, and destination `port`. React Flow conversion belongs to the web layer.

## Why (beginner level)
Keeping the graph format small means the compiler can be tested in Node and reused by the web app without importing UI code.

## Trade-offs
The web canvas needs an adapter before compilation. Compiler tests can run without a browser.

## Interview answer (30 seconds)
The compiler takes the AI graph schema, not React Flow objects. That keeps UI details out of validation and makes the same compiler usable in tests and the browser.
