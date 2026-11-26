<!-- Purpose: records the no-dependency editor choice for Strategy Studio. Connects: source editing to accurate compiler line feedback. -->
# 048: Use a plain textarea for strategy code

## Context (plain words)
The Studio needs code editing with line numbers, saved drafts, source errors, and file open/save without adding a package.

## Options considered
- Add a dedicated code-editor dependency.
- Use a regular textarea with a line-number gutter and existing browser APIs.

## Decision
Use a plain monospaced textarea, a synchronized line-number gutter, compiler-driven error marks, and browser file APIs. Keep the last draft in local storage.

## Why (beginner level)
This provides the needed editing workflow with the dependencies already in the project. Compiler positions remain the source for line and column feedback.

## Trade-offs
The editor does not have advanced features such as syntax coloring or code completion. It is simpler to install, explain, and maintain.

## Interview answer (30 seconds)
I chose a textarea because the project needs a small strategy editor, not a full IDE. A gutter and compiler messages provide line feedback without another dependency.
