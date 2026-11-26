<!-- Purpose: records the Studio's code-first and read-only graph model. Connects: strategy language source to the compiler graph preview. -->
# 047: Strategy code is the source of truth

## Context (plain words)
The Studio needs to show both the strategy text and the graph created from it. Editing both at once could let them disagree.

## Options considered
- Let users edit the graph and code in parallel.
- Keep code editable and show its generated graph as a read-only explanation.

## Decision
The strategy text is the editable source of truth. The Graph tab reuses the canvas node views and dagre layout, but is read-only. If compilation fails, it shows a friendly incomplete-preview message and highlights nodes when a source-mapped error identifies one.

## Why (beginner level)
The compiler always creates the graph from the text, so there is only one place to make a change. A read-only graph helps a beginner understand the code without creating a second version that could get out of sync. Invalid or partial graphs must never prevent the page from explaining what needs fixing.

## Trade-offs
The Studio cannot repair a strategy by dragging graph nodes. Users change the code and the graph updates from it.

## Interview answer (30 seconds)
I kept the strategy text as the single editable version. The graph is a safe, read-only picture generated from that text, so the code and graph cannot contradict each other.
