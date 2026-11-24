<!-- Purpose: records source locations preserved by the language compiler. Connects: graph/compiler errors to the source editor. -->
# 043: Preserve a source map for strategy code

## Context (plain words)
After text becomes graph nodes, the user still needs to know which line created a node when the compiler finds a problem.

## Options considered
- Return only graph compiler diagnostics with node ids.
- Keep a node-id-to-source-span map and translate compiler diagnostics back to source.

## Decision
`compileSource(source, config)` returns the generated graph and a source map on success and failure. Each graph node maps to a 1-based line and an end-exclusive column span. Compiler diagnostics with a node id include line and column information.

## Why (beginner level)
Node ids are useful to the compiler but not to someone editing code. A source map turns a node error into a place the user can find.

## Trade-offs
The source map is extra result data and needs to remain in sync with graph lowering. It makes editor diagnostics much more useful.

## Interview answer (30 seconds)
Every emitted node records the source span that created it. If a later compiler pass rejects that node, `compileSource` looks up the id and adds its source line and column to the diagnostic.
