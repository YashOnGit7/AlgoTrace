<!-- Purpose: records the safety boundary between AI-generated source and trading simulation. Connects: assistant output to the compiler and user-controlled run button. -->
# 051: Compile assistant code and let the user start runs

## Context (plain words)
AI-written strategy code can be incorrect, so it must be checked and reviewed before any backtest starts.

## Options considered
- Let the assistant automatically start a backtest as soon as it writes code.
- Put code in the editor, run the existing compiler, and leave Run as a separate user action.

## Decision
Every model answer is placed in the editor and passed through `compileSource`. Send compiler messages and the previous generated source back for no more than two repair attempts. Show the final remaining messages for manual editing. The assistant never presses or invokes Run; only the user can start a backtest.

## Why (beginner level)
Compiler checks catch unsupported syntax and missing inputs, while the student remains in control of whether to run a strategy. Keeping the backtest button separate also makes the review step clear.

## Trade-offs
Some generated code may still have errors after two fixes and require hand editing. The user must review the final code and choose to run it.

## Interview answer (30 seconds)
The assistant only writes code. The same compiler used by the language editor checks it, with up to two repair requests. A person reviews the source and explicitly clicks Run, so the AI cannot start a simulation on its own.
