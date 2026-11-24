<!-- Purpose: records the choice to implement strategy syntax without parser libraries. Connects: source text to the existing compiler graph format. -->
# 041: Handwritten strategy lexer and parser

## Context (plain words)
The project needs a small plain-text strategy language that turns into the graph format the compiler already understands.

## Options considered
- Add a parser generator or parsing dependency.
- Write a focused lexer and parser in TypeScript.

## Decision
Use a handwritten lexer, precedence-climbing expression parser, and a separate graph-lowering pass under `compiler/src/language/`. Add no dependency.

## Why (beginner level)
The language is intentionally small. Keeping the scanner and parser in our own code makes each token, rule, and error location easy to explain and avoids a new package.

## Trade-offs
The project owns error recovery and grammar changes. In return, the implementation has no parser-library dependency and directly records source positions.

## Interview answer (30 seconds)
The lexer converts characters to positioned tokens. A hand-written parser builds expressions using the documented precedence table. A final pass creates the AI graph, then the existing compiler validates it and emits the engine AST.
