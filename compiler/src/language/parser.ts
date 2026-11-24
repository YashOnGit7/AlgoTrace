/** Purpose: parses line-oriented strategy tokens into statement/expression syntax trees. Connects: lexical tokens to graph conversion. */
import type { Expr, SourceDiagnostic, SourceSpan, Statement, Token } from "./model.js";

const functions = new Set(["sma", "ema", "rsi", "delay", "crosses_above", "crosses_below"]);
const keywords = new Set(["strategy", "buy", "sell", "when", "size", "stop_loss", "take_profit", "and", "or", "not"]);
const fields = new Set(["open", "high", "low", "close", "volume"]);
export interface ParseResult { readonly statements: readonly Statement[]; readonly diagnostics: readonly SourceDiagnostic[] }

/** Parses all recoverable lines in source order using precedence climbing. @example `parse(lex("buy when close > 2").tokens).statements` contains one rule. */
export function parse(tokens: readonly Token[]): ParseResult {
  let i = 0; const statements: Statement[] = [], diagnostics: SourceDiagnostic[] = [];
  const peek = (): Token => tokens[i] ?? tokens[tokens.length - 1]!;
  const take = (): Token => { const token = peek(); if (token.kind !== "eof") i += 1; return token; };
  const error = (code: SourceDiagnostic["code"], token: Token, expected: string, hint = "Check this line and use lowercase keywords."): void => {
    diagnostics.push({ code, line: token.line, startColumn: token.startColumn, column: token.startColumn, endColumn: token.endColumn, message: `Expected ${expected}; found ${token.text || "end of line"}.`, hint });
  };
  const expect = (text: string): Token => { const token = peek(); if (token.text === text) return take(); error("AT-S002", token, JSON.stringify(text)); throw new Error("recover-line"); };
  const expression = (min = 1): Expr => {
    let left: Expr; const first = take();
    if (first.text === "-") { const value = expression(7); left = { kind: "unary", op: "-", value, span: join(first, value.span) }; }
    else if (first.text === "not") { const value = expression(3); left = { kind: "unary", op: "not", value, span: join(first, value.span) }; }
    else if (first.text === "(") { left = expression(); expect(")"); }
    else if (first.kind === "number") left = { kind: "number", value: Number(first.value), span: first };
    else if (first.kind === "identifier") {
      if (peek().text === "(") {
        if (!functions.has(first.text)) { error("AT-S003", first, "a known function", "Function names must be lowercase and listed in strategy-language.md."); throw new Error("recover-line"); }
        take(); const args: Expr[] = [];
        if (peek().text !== ")") { args.push(expression()); while (peek().text === ",") { take(); args.push(expression()); } }
        const close = expect(")"); left = { kind: "call", name: first.text, args, span: { line: first.line, startColumn: first.startColumn, endColumn: close.endColumn } };
      } else if (keywords.has(first.text) || fields.has(first.text)) left = { kind: "name", value: first.text, span: first };
      else left = { kind: "name", value: first.text, span: first };
    } else { error("AT-S002", first, "an expression"); throw new Error("recover-line"); }
    while (true) {
      const op = peek().text; const precedence = ({ or: 1, and: 2, ">": 4, "<": 4, "+": 5, "-": 5, "*": 6, "/": 6 } as Record<string, number>)[op] ?? 0;
      if (precedence < min || precedence === 0) break;
      const operator = take(); const right = expression(precedence + 1);
      if ((op === ">" || op === "<") && left.kind === "binary" && (left.op === ">" || left.op === "<")) { error("AT-S002", operator, "a single comparison per expression"); throw new Error("recover-line"); }
      left = { kind: "binary", op, left, right, span: { line: left.span.line, startColumn: left.span.startColumn, endColumn: right.span.endColumn } };
    }
    return left;
  };
  while (peek().kind !== "eof") {
    if (peek().kind === "newline") { take(); continue; }
    const start = peek();
    try {
      if (start.kind === "identifier" && tokens[i + 1]?.text === "=") {
        const name = take(); take(); const value = expression(); statements.push({ kind: "assignment", name: name.text, expression: value, span: join(name, value.span) });
      }
      else if (start.text === "strategy") { take(); const title = peek(); if (title.kind !== "string") { error("AT-S002", title, "a quoted strategy title"); throw new Error("recover-line"); } take(); statements.push({ kind: "title", name: String(title.value), span: join(start, title) }); }
      else if (start.text === "buy" || start.text === "sell") { take(); expect("when"); const value = expression(); statements.push({ kind: "rule", name: start.text, expression: value, span: join(start, value.span) }); }
      else if (["size", "stop_loss", "take_profit"].includes(start.text)) {
        take(); const value = peek(); if (value.kind !== "number") { error("AT-S005", value, "a number followed by %"); throw new Error("recover-line"); } take(); expect("%");
        statements.push({ kind: "setting", name: start.text as "size" | "stop_loss" | "take_profit", value: Number(value.value), span: join(start, value) });
      } else { error("AT-S002", start, "an assignment, buy/sell rule, or setting"); throw new Error("recover-line"); }
      if (peek().kind !== "newline" && peek().kind !== "eof") { error("AT-S002", peek(), "the end of the statement"); throw new Error("recover-line"); }
    } catch { while (peek().kind !== "newline" && peek().kind !== "eof") take(); }
    if (peek().kind === "newline") take();
  }
  return { statements, diagnostics: diagnostics.sort((a, b) => a.line - b.line || a.startColumn - b.startColumn) };
}

/** Combines the first token and final source span into an exclusive-end span. @example `join(token, span).endColumn` points just after the expression. */
function join(a: Token, b: SourceSpan): SourceSpan { return { line: a.line, startColumn: a.startColumn, endColumn: b.endColumn }; }
