<!-- Purpose: records safe provider diagnostics and compatibility retry. Connects: Groq errors to clear API feedback. -->
# 053: Diagnose Groq failures and retry unsupported reasoning options minimally

## Context (plain words)
The assistant previously returned one generic unavailable message for Groq authentication, model, request-option, rate-limit, network, timeout, and empty-response failures.

## Options considered
- Return the same generic error for every provider failure.
- Classify the status and safe error fields, explain the likely cause, and retry only when Groq explicitly rejects a reasoning option.

## Decision
Classify Groq errors into safe categories and log only status, provider error code/message, rejected option, and category; redact the configured key before logging. Return a beginner-readable message without provider secrets. If a 400 error explicitly says `reasoning_effort`, `include_reasoning`, or `reasoning_format` is unsupported, retry once with only `model` and `messages`. The diagnostic script makes exactly one request using the normal assistant options and never retries.

## Why (beginner level)
The user can tell whether to fix a key, model, request option, connection, or wait for a rate limit. The retry handles an endpoint or account that rejects reasoning controls without changing the source grammar or exposing private credentials.

## Trade-offs
The API may make one additional request only after a clearly identified unsupported reasoning option. Groq currently documents `reasoning_effort` and `include_reasoning` for GPT-OSS, so this retry is a compatibility fallback and not a claim that those options caused the current report.

## Interview answer (30 seconds)
I replaced the generic AI error with a small safe error classifier. If Groq specifically rejects a reasoning setting, the API retries once with only the required model and messages; the check script sends just one request and shows redacted diagnostics.
