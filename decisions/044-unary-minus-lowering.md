<!-- Purpose: documents how unary minus is represented with the current graph node catalogue. Connects: parsed negative expressions to valid graph operations. -->
# 044: Lower unary minus using existing nodes

## Context (plain words)
The language permits unary minus, but the graph catalogue has subtraction and no dedicated negation node.

## Options considered
- Add a new graph operation for negation.
- Represent `-x` as subtraction from zero.

## Decision
Lower unary minus to `SUB(CONSTANT(0), x)`. This mapping is specified in `/spec/strategy-language.md`.

## Why (beginner level)
The current graph already has all the pieces needed to express a negative value, so no new operation or engine behavior is needed.

## Trade-offs
The graph contains an extra constant and subtraction node for each unary minus. The mapping is explicit and uses operations already validated by the compiler.

## Interview answer (30 seconds)
The parser preserves unary minus as a syntax node. During graph lowering, it creates zero and connects zero and the operand to a SUB node, which keeps the graph within the existing node catalogue.
