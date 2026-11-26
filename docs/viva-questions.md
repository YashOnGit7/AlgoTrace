<!-- Purpose: collects likely panel questions and clear answers. Connects: project decisions and implementation explanations. -->

# Viva questions

## How does the browser give price data to the Rust engine?
The TypeScript wrapper asks Rust to reserve enough WebAssembly memory, then copies the AGT1 bytes there once. Rust reads the bytes in place for a run. We call that zero-copy only for the Rust-side reads after the initial transfer; the browser-to-WASM write is still a copy.

## Why does the TypeScript wrapper recreate typed-array views?
WebAssembly can grow its linear memory. Growth can replace the JavaScript buffer, so a view created before growth may no longer point at the current memory. The wrapper creates result views only after calls that may grow memory.

## Why are trades returned as columns?
Each field is stored contiguously, so the web chart or table can read only the fields it needs. It also gives every trade field a simple pointer and length contract.

## Why is yfinance used only once for the frozen data?
yfinance is an unofficial source, and repeated downloads could change the inputs to a demonstration. Saving one snapshot makes runs repeatable and lets us record its date and tool versions.

## What is the main limitation of the stock list?
It contains today's large companies, not the full set of companies that existed in each historical year. That creates survivorship bias and can make historical results look better than a point-in-time universe would.

## Why did vectorbt differ from AlgoTrace on one SBIN trade?
Both tools had a signal exit scheduled for the next open, and that bar's low later crossed the stop. Accepted rule G15 says the scheduled open exit wins, so AlgoTrace processed it first; vectorbt's built-in stop handling prioritized the intrabar stop. The exact exit prices and equity values are in decision 028, and the SBIN stop comparison is limited to bars through 2501.

## What happened when you compared your engine to vectorbt, and what did you learn?
Eight of the nine strategy and stock comparisons matched over the full history, including exact trade dates and share counts and prices/equity within `1e-6`. The remaining SBIN stop-strategy comparison matches through bar 2501. On bar 2502, a scheduled signal exit and an intrabar stop overlap: AlgoTrace exits at the open under G15, while vectorbt applies its built-in stop first. I tried disabling the stop with a per-bar stop array, but vectorbt still used it, so I documented a named exception instead of weakening the comparison or changing the engine. I learned that independent tools can implement different event priorities even with identical signals, and that those differences need explicit rules and transparent comparison boundaries.

## How does the compiler turn an AI graph into an engine AST?
It checks the graph shape, connects each input port, orders dependencies with Kahn's algorithm, then checks types and parameters. It removes unused nodes with a warning, merges identical calculations, runs the safe constant-fold pass, and emits the versioned AST with stable ordering. The final integration test sends that AST to the real Rust/WASM engine.

## Why does the compiler stop after the first failing stage?
Later checks can be confusing when an earlier structural rule is broken. The compiler reports every error in the earliest failing stage, sorts them by a fixed rule, then waits for the graph to be fixed before checking later stages.

## Why does the browser run the engine in a Web Worker?
The worker keeps CPU work away from the screen thread, so the page can still respond while the Rust/WASM engine runs. The page transfers the API ArrayBuffer to the worker; the worker writes those bytes once into WASM memory, copies the results into transferable arrays, and sends them back for charting.

## Why does the reference say 79 trades while the page says 78 closed trades?
The reference's 79 records include one position that remains open at the final bar. `/spec/metrics.md` counts closed trades only, so the engine reports 78 closed trades. The page shows the 79 total records separately and explains that the open position is excluded from the closed count.

## How does the strategy canvas prevent a type-invalid connection?
While a wire is being drawn, React Flow asks the compiler's `connectionDiagnostic()` helper about that proposed edge. The helper invokes the same compiler input and type-check passes used by `compile()`, including Number broadcasting rules. If the types do not fit, React Flow refuses the edge and the page shows the compiler code and friendly message. This avoids copying the type rules into the web app.

## How does a saved strategy graph differ from its canvas layout?
The saved JSON contains only the spec graph: node IDs, node types, parameters, and source-to-port edges. Node screen positions, selection, and zoom are local canvas state. This keeps saved graphs portable and keeps the compiler independent of React Flow.

## Why use dagre for automatic graph layout?
Dagre positions nodes based on their dependencies so data usually flows from left to right. Before any wires exist, there is no dependency order, so the canvas uses a spaced grid to keep newly added cards apart.

## Why is the Strategy Studio graph read-only?
The strategy text is the source of truth. The compiler generates the graph from that text, so allowing independent graph edits could make the two versions disagree. The graph is an explanation of the code and remains safe to display when the source has an error.

## How does the Strategy Studio connect code to a backtest?
The page compiles the source after a short pause, shows compiler locations beside the code, and sends a valid AST with fetched AGT1 price bytes to the existing Web Worker. The worker runs the Rust/WASM engine and returns equity and metrics for the results view.
# Strategy language

**Q: How does the handwritten strategy language frontend work?**  
A: The lexer scans source characters into tokens with line and column positions. The parser checks statements and groups expressions using precedence. A lowering pass creates the existing AI graph and stores a source map, then the existing compiler checks the graph and creates the AST.

**Q: How do you handle unary minus when there is no NEGATE graph node?**  
A: I lower `-x` to `SUB(CONSTANT(0), x)`. This uses existing graph operations and keeps the engine unchanged.

**Q: What happens when a compiler error comes from source code?**  
A: Each generated node has a source span. `compileSource` maps a node-based compiler diagnostic back to the corresponding source line and column.
