<!-- Purpose: records the checked-in graph fixture corpus. Connects: graph specification examples to compiler and engine acceptance tests. -->
# 032: Compiler example corpus

## Context (plain words)
The existing specification described graph shapes but did not include complete strategy or error examples.

## Options considered
- Keep examples embedded only in test code.
- Add readable graph JSON and matching golden AST examples under `/spec/examples/`.

## Decision
Add the three reference strategies as graph files, golden AST files for each, one invalid graph for every AT-E001–AT-E010, and one AT-W001 graph. JSON comments are not added because they would make the files invalid JSON.

## Why (beginner level)
Files make examples easy to inspect, edit, and reuse in tests and demos.

## Trade-offs
The README beside the examples explains them because JSON has no comment syntax.

## Interview answer (30 seconds)
I turned each reference strategy into a checked-in graph and golden AST, then added one small fixture per compiler diagnostic. That lets reviewers see what each example means without digging through test setup code.
