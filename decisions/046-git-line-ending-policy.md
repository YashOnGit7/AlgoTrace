<!-- Purpose: records the repository's cross-platform line-ending and binary-file policy. Connects: Git checkout behavior to stable tests and intact data files. -->
# 046: Enforce LF text and preserve binary files

## Context (plain words)
Git on Windows can convert LF files to CRLF in a fresh clone, while CI runs on Linux and expects the committed LF form. Binary data must not be treated as text.

## Options considered
- Rely on each developer's global Git line-ending setting.
- Declare repository-wide LF text endings and explicitly mark binary formats.

## Decision
Add root `.gitattributes` with `* text=auto eol=lf` and mark binary project formats, including `.agt1`, `.png`, and `.pdf`, as binary. Normalize tracked text files to LF if necessary.

## Why (beginner level)
The same text file should have the same line endings in Windows clones and Linux CI. Binary price and report files contain bytes that must remain unchanged.

## Trade-offs
Windows working copies use LF for text. This avoids platform-specific test results and keeps binary files out of line-ending conversion.

## Interview answer (30 seconds)
I set Git attributes so text files check out with LF on every operating system and binary formats stay byte-for-byte data. That removes line-ending differences between Windows development and Linux CI.
