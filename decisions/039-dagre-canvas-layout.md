<!-- Purpose: records the approved graph layout library and canvas positioning rule. Connects: React Flow node positions to a readable graph layout. -->
# 039: Dagre for strategy graph layout

## Context (plain words)
The canvas needs a quick way to arrange connected strategy nodes so their data flow is easy to follow.

## Options considered
- Leave nodes where they were added and ask the user to arrange all of them.
- Use a graph layout library to place dependencies in readable order.

## Decision
Use the user-approved `@dagrejs/dagre` dependency for automatic left-to-right layout. Before the first edge exists, arrange palette nodes in a spaced grid because independent nodes have no dependency order. Once edges exist, arrange nodes using their connections. Record the dependency in `web/package.json` and `pnpm-lock.yaml`.

## Why (beginner level)
Dagre reads which nodes depend on other nodes and chooses positions that make the flow easier to trace. An unconnected palette has no such relationships yet, so a simple grid prevents cards from stacking on each other.

## Trade-offs
The automatic arrangement is a convenience, not a promise of the only good layout. The project carries one small layout dependency, approved for this requested feature.

## Interview answer (30 seconds)
The canvas uses dagre to arrange connected graph nodes from left to right. Before there are connections, dagre has no dependency structure to arrange, so I spread new nodes in a grid. The graph itself remains in the compiler JSON format; positions belong only to the canvas.
