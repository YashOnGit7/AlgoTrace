/** Purpose: defines source tokens, syntax nodes, and source diagnostics. Connects: lexer output to parser and graph conversion. */
export type SourceCode = "AT-S001" | "AT-S002" | "AT-S003" | "AT-S004" | "AT-S005" | "AT-S006";
export interface SourceSpan { readonly line: number; readonly startColumn: number; readonly endColumn: number }
export interface SourceDiagnostic extends SourceSpan { readonly code: SourceCode; readonly column: number; readonly message: string; readonly hint: string }
export type TokenKind = "identifier" | "number" | "string" | "newline" | "symbol" | "eof";
export interface Token extends SourceSpan { readonly kind: TokenKind; readonly text: string; readonly value?: string | number }
export type Expr = { readonly kind: "number"; readonly value: number; readonly span: SourceSpan }
 | { readonly kind: "name"; readonly value: string; readonly span: SourceSpan }
 | { readonly kind: "unary"; readonly op: "-" | "not"; readonly value: Expr; readonly span: SourceSpan }
 | { readonly kind: "binary"; readonly op: string; readonly left: Expr; readonly right: Expr; readonly span: SourceSpan }
 | { readonly kind: "call"; readonly name: string; readonly args: readonly Expr[]; readonly span: SourceSpan };
export type Statement = { readonly kind: "title"; readonly name: string; readonly span: SourceSpan }
 | { readonly kind: "assignment"; readonly name: string; readonly expression: Expr; readonly span: SourceSpan }
 | { readonly kind: "rule"; readonly name: "buy" | "sell"; readonly expression: Expr; readonly span: SourceSpan }
 | { readonly kind: "setting"; readonly name: "size" | "stop_loss" | "take_profit"; readonly value: number; readonly span: SourceSpan };
