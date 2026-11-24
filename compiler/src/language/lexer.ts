/** Purpose: turns strategy source characters into positioned tokens. Connects: UTF-16 source text to the hand-written parser. */
import type { SourceDiagnostic, SourceSpan, Token } from "./model.js";

export interface LexResult { readonly tokens: readonly Token[]; readonly diagnostics: readonly SourceDiagnostic[] }

/** Scans one source string, treating CRLF/LF equally and keeping columns 1-based. @example `lex("x=2").tokens[0]?.text` is `x`. */
export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: SourceDiagnostic[] = [];
  let index = 0, line = 1, column = 1;
  const span = (start: number, end: number, atLine: number, atColumn: number): SourceSpan => ({ line: atLine, startColumn: atColumn, endColumn: atColumn + end - start });
  const advance = (): string => {
    const ch = source[index] ?? "";
    index += 1;
    if (ch === "\r" && source[index] === "\n") index += 1;
    if (ch === "\r" || ch === "\n") { line += 1; column = 1; } else column += 1;
    return ch;
  };
  const emit = (kind: Token["kind"], text: string, value: Token["value"], start: number, atLine: number, atColumn: number): void => {
    tokens.push({ kind, text, ...(value === undefined ? {} : { value }), ...span(start, index, atLine, atColumn) });
  };
  while (index < source.length) {
    const ch = source[index] ?? "";
    if (ch === " " || ch === "\t" || ch === "\f") { advance(); continue; }
    if (ch === "\r" || ch === "\n") {
      const start = index, atLine = line, atColumn = column; advance();
      tokens.push({ kind: "newline", text: "\\n", line: atLine, startColumn: atColumn, endColumn: atColumn + 1 }); continue;
    }
    if (ch === "#") { while (index < source.length && source[index] !== "\r" && source[index] !== "\n") advance(); continue; }
    const start = index, atLine = line, atColumn = column;
    if (/[A-Za-z_]/.test(ch)) {
      advance(); while (/[A-Za-z0-9_]/.test(source[index] ?? "")) advance();
      emit("identifier", source.slice(start, index), undefined, start, atLine, atColumn); continue;
    }
    if (/[0-9]/.test(ch)) {
      advance(); while (/[0-9]/.test(source[index] ?? "")) advance();
      if (source[index] === "." && /[0-9]/.test(source[index + 1] ?? "")) { advance(); while (/[0-9]/.test(source[index] ?? "")) advance(); }
      const text = source.slice(start, index); emit("number", text, Number(text), start, atLine, atColumn); continue;
    }
    if (ch === '"') {
      advance(); let closed = false;
      while (index < source.length && source[index] !== "\r" && source[index] !== "\n") {
        if (source[index] === '"') { advance(); closed = true; break; }
        advance();
      }
      if (closed) emit("string", source.slice(start, index), source.slice(start + 1, index - 1), start, atLine, atColumn);
      else diagnostics.push({ code: "AT-S002", ...span(start, index, atLine, atColumn), column: atColumn, message: "Expected a closing quote for the title string.", hint: "Add a closing double quote on the same line." });
      continue;
    }
    if ("=()+-*/><,%".includes(ch)) { advance(); emit("symbol", ch, undefined, start, atLine, atColumn); continue; }
    advance(); diagnostics.push({ code: "AT-S001", ...span(start, index, atLine, atColumn), column: atColumn, message: `Unexpected character ${JSON.stringify(ch)}.`, hint: "Remove it or replace it with a character used by the language; keywords and function names must be lowercase." });
  }
  tokens.push({ kind: "eof", text: "", line, startColumn: column, endColumn: column });
  return { tokens, diagnostics: diagnostics.sort((a, b) => a.line - b.line || a.startColumn - b.startColumn) };
}
