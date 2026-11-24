<!-- Purpose: records the workflow fix for Vitest accidentally discovering Playwright tests. Connects: shell glob handling to CI's intended unit-test selection. -->
# 045: Quote Vitest exclusions in CI

## Context (plain words)
The TypeScript job failed during its unit-test step after the canvas added Playwright browser tests under `web/e2e/`.

## Options considered
- Change the test files or their contents.
- Have CI call each package test runner directly and keep Vitest exclusion patterns quoted in the workflow.

## Decision
In CI, run compiler tests directly, then invoke the web Vitest runner directly with single-quoted exclusions for integration tests and `e2e/**`. The tests are unchanged.

## Why (beginner level)
On Ubuntu, the shell expands unquoted wildcard patterns before Vitest receives them. That let the Playwright spec reach Vitest, which reported that Playwright's `test()` was called from the wrong runner. Quoting the patterns passes them to Vitest so it can exclude those files; the real-WASM tests remain in the later `pnpm test:wasm` step.

## Trade-offs
The workflow lists compiler and web unit tests as separate steps instead of using the root recursive test command. This makes the test selection explicit and the CI log easier to diagnose.

## Interview answer (30 seconds)
Vitest was discovering a Playwright browser test because Bash expanded an unquoted exclusion glob. I changed only the workflow: it runs compiler tests, then calls Vitest for web unit tests with quoted exclusion patterns. The browser tests and their code did not change.
