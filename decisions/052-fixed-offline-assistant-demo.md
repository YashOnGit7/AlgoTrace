<!-- Purpose: records the offline assistant fallback and its clear labeling. Connects: internet-free demonstrations to fixed checked examples. -->
# 052: Use five fixed answers in offline demo mode

## Context (plain words)
The local AI proxy needs internet access and a Groq key, but a classroom demonstration should still work without either.

## Options considered
- Hide the assistant entirely when the provider is unavailable.
- Offer a clearly labeled set of five fixed request-to-code examples that are checked by the compiler.

## Decision
Provide an explicit Offline demo mode with exactly five sentence-to-source mappings: the three reference strategies and two additional strategies using named values and boolean operators. The mode never calls AI, accepts only those exact sentences, compiles each answer, and labels the result “from a built-in example, not from the AI.”

## Why (beginner level)
The student can demonstrate the editor and compiler without internet while seeing clearly that the answer was prewritten rather than generated.

## Trade-offs
Offline mode understands only its five fixed sentences. General English requests need the configured Groq assistant.

## Interview answer (30 seconds)
Offline mode is a reliable classroom fallback. It maps five exact sample sentences to fixed, compiler-tested programs and labels every result as a built-in example, so it cannot be confused with live AI.
