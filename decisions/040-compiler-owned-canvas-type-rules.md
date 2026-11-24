<!-- Purpose: records how the editor shares connection type rules with the compiler. Connects: interactive React Flow wires to compile-time validation. -->
# 040: Compiler-owned live connection checks

## Context (plain words)
The canvas should refuse invalid wires while they are being drawn, and the compiler remains the authority on which types each port accepts.

## Options considered
- Copy the port compatibility rules into the React application.
- Let the compiler expose a focused helper that reuses its current validation, ordering, and type-check passes.

## Decision
Expose `connectionDiagnostic()` and the node catalogue on the compiler package's `canvas-rules` subpath. The helper evaluates a proposed edge using the compiler's own passes, including Number-to-Series broadcasting and the at-least-one-Series rule. The canvas does not implement a second type table.

## Why (beginner level)
If the canvas and compiler have separate rule lists, the screen might allow a wire that later fails when the user compiles. Sharing the compiler check means both places follow one set of rules.

## Trade-offs
The compiler package has a small editor-facing export alongside `compile()`. A proposed wire runs a short compiler type pass, which is clear and consistent for the current graph sizes.

## Interview answer (30 seconds)
React Flow asks the compiler whether a proposed connection is compatible. The helper creates a candidate graph and runs the existing validation and type-check code. The canvas uses the resulting diagnostic to block the wire and show the compiler's message.
