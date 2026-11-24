<!-- Purpose: specifies the beginner strategy language and its graph mapping. Connects: source text to the existing compiler input format. -->
# Strategy language v1

The language is a line-oriented way to write a strategy graph. Source uses lowercase, case-sensitive keywords and functions. `#` starts a comment through the end of line except inside the quoted title. Full-line comments and trailing comments are allowed. LF and CRLF line endings are equivalent; a final newline is optional. Lines and columns are 1-based. Tabs count as one column. A source span is `[start, end)`: the end is just after its final character.

An optional `strategy "Name"` title may appear on the first non-blank, non-comment line. An unterminated title string is `AT-S002` (expected a closing quote). The title is metadata and does not change strategy semantics.

## Grammar (EBNF)

```ebnf
program       = { blank | comment | title | assignment | rule | setting } ;
title         = "strategy" , string , line-end ;
assignment    = identifier , "=" , expression , line-end ;
rule          = ( "buy" , "when" | "sell" , "when" ) , expression , line-end ;
setting       = ( "size" | "stop_loss" | "take_profit" ) , number , "%" , line-end ;
line-end      = [ newline ] ;
blank         = newline ;
comment       = "#" , { any-character-except-newline } , [ newline ] ;
expression    = or-expression ;
or-expression = and-expression , { "or" , and-expression } ;
and-expression= not-expression , { "and" , not-expression } ;
not-expression= [ "not" ] , comparison ;
comparison    = sum , [ ( ">" | "<" ) , sum ] ;
sum           = product , { ( "+" | "-" ) , product } ;
product       = unary , { ( "*" | "/" ) , unary } ;
unary         = [ "-" ] , atom ;
atom          = number | price | identifier | call | "(" , expression , ")" ;
call          = function , "(" , expression , "," , expression , ")" ;
function      = "sma" | "ema" | "rsi" | "delay" | "crosses_above" | "crosses_below" ;
price         = "open" | "high" | "low" | "close" | "volume" ;
number        = digit , { digit } , [ "." , digit , { digit } ] ;
identifier    = ( letter | "_" ) , { letter | digit | "_" } ;
string        = '"' , { any-character-except-quote-or-newline } , '"' ;
```

Statements may be interleaved in any order after the optional title. Assignments must precede every use and may appear only once. There must be exactly one `buy when` and one `sell when`. Settings may appear anywhere, at most once each. `size` accepts 1..100 and defaults to 100%; `stop_loss` accepts 0.1..50%; `take_profit` accepts 0.1..500%. Stop and take profit are off when omitted. All settings require `%`. Names cannot be keywords, price fields, or function names.

## Operator precedence

| Precedence, low to high | Operators | Associativity |
|---|---|---|
| 1 | `or` | left |
| 2 | `and` | left |
| 3 | `not` | prefix |
| 4 | `>`, `<` | non-associative; chained comparisons are rejected |
| 5 | `+`, `-` | left |
| 6 | `*`, `/` | left |
| 7 | unary `-` | prefix |
| 8 | calls, names, literals, parenthesized expressions | — |

Only `>` and `<` comparisons exist. `>=`, `<=`, `==` and chained comparisons are syntax errors.

## Mapping to graph nodes

| Source construct | Graph mapping |
|---|---|
| Used price field | One shared `PRICE(field)` node per field |
| Number literal | `CONSTANT(value)` |
| `sma/ema/rsi/delay(x,n)` | `SMA/EMA/RSI/DELAY`, with `input` edge and `period` or `bars` parameter |
| `crosses_above/below(a,b)` | `CROSSES_ABOVE/BELOW` with `a` and `b` edges |
| `+ - * /` | `ADD/SUB/MUL/DIV` with `a` and `b` edges |
| `>`, `<` | `GT`, `LT` with `a` and `b` edges |
| `and`, `or`, `not` | `AND`, `OR`, `NOT` with named input edges |
| Unary minus | `CONSTANT(0)` and `SUB(0, operand)`; decision record 044 |
| `buy when condition` | Condition edge to `STRATEGY.entry` |
| `sell when condition` | Condition edge to `STRATEGY.exit` |
| `size`, `stop_loss`, `take_profit` | `position_size_pct`, `stop_loss_pct`, `take_profit_pct` strategy params |

Periods are integer literals with the exact ranges from `/spec/nodes.md`: SMA/EMA 2..500, RSI 2..200, DELAY 1..50. Other argument forms, non-integer periods and out-of-range periods are `AT-S006`. Graph node IDs are `n1`, `n2`, … in order of first graph-node creation during source traversal. A price node is created on its first use and reused thereafter. The graph is then passed to the existing `compile(graph, config)`; that compiler remains authoritative for types and AST validation.

## Source positions and diagnostics

Every generated node has a source map entry containing its source line and start/end columns. A graph error with a `nodeId` maps to the span that created that node. A graph-level error maps to the relevant rule or to the whole source if no narrower span exists. `compileSource` preserves the ordinary compile result fields and adds the graph and source map on both success and failure.

| Code | Meaning | Beginner hint |
|---|---|---|
| AT-S001 | Unexpected character | Remove the character or replace it with a supported symbol. |
| AT-S002 | Unexpected or missing token, including an unterminated title string | The message names the token expected at this position; close title text with `"`. |
| AT-S003 | Unknown name or function | Check spelling and use a lowercase built-in function or a price field. |
| AT-S004 | Name used before assignment or assigned twice | Assign each name once before first use. |
| AT-S005 | Title misplaced, buy/sell rule missing or repeated, or setting repeated/malformed | Put the title first, write one buy and sell rule, and use each setting once. |
| AT-S006 | Wrong argument count or invalid period | Use two arguments and an integer period in the range listed for that function. |

When a keyword/function is written with uppercase letters, the hint explicitly says keywords and function names must be lowercase. Syntax recovery synchronizes at the next line where safe; otherwise the parser returns the first diagnostic at which reliable recovery is impossible. Diagnostics are returned in source line and column order.
