<!-- Purpose: records the v1 source-language grammar and statement behavior. Connects: user-authored code to language diagnostics and graph lowering. -->
# 042: Strategy language v1 design

## Context (plain words)
The language needs simple, predictable syntax that covers the three reference strategies while matching the existing node catalogue.

## Options considered
- Restrict strategies to one fixed statement order and a small expression form.
- Allow readable expressions with a fixed precedence table and interleaved statements.

## Decision
Use the grammar, operators, functions, settings, and node mappings in `/spec/strategy-language.md`. Statements after an optional first-line title may be interleaved. Assignments are single-assignment and must precede use; exactly one buy and sell rule are required; settings may each appear once. Comments start at `#`, except within the quoted title. Source supports LF/CRLF and an optional final newline. Positions are 1-based, end-exclusive, and tabs count as one column. Uppercase keyword/function spellings receive a lowercase hint. An unterminated title string is AT-S002.

## Why (beginner level)
The familiar arithmetic precedence avoids surprising expressions. Interleaving allows settings and rules to sit near related assignments without weakening the rule that a value must exist before it is used.

## Trade-offs
This is a small language: only `>` and `<` comparisons exist, and comparisons cannot chain. That keeps the compiler mapping direct and errors understandable.

## Interview answer (30 seconds)
The language supports assignments, indicators, boolean conditions, two trading rules, and three settings. Its grammar is specified with precedence, and each source construct maps to an existing graph node or strategy parameter.
