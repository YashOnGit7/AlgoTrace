<!-- Purpose: defines the versioned Strategy AST and its canonical JSON serialization. Connects: compiler output to the Rust engine input. -->
# Strategy AST (JSON)

Fields: `version` (integer 1); `config`: `initial_capital`, `slippage_pct`, cost preset object, `force_close_at_end`, `risk_free_rate`, `trading_days_per_year`; `nodes`: list in dependency order, each with `id`, `op`, `params`, `inputs` (port name -> node id); `sink`: id of the `STRATEGY` node.

Every config field ending in `_pct` is expressed in percentage points (`0.1` means `0.1%`).

The same graph must always give byte-identical JSON. Order nodes with Kahn's algorithm; among nodes ready at the same time, take the smallest `id` (plain string comparison). When duplicate nodes merge, the node with the smallest `id` survives. Two nodes are the same computation when `op`, `params`, and `inputs` (port name to node id, after earlier merges) are all equal. Process in dependency order so merges cascade. Do not normalize commutative operations in v1 (`a+b` and `b+a` are distinct computations).

Top-level JSON keys are ordered `version`, `config`, `nodes`, `sink`. Within `config`, node `params`, node `inputs`, and the cost preset object, keys are sorted alphabetically. Node objects use `id`, `op`, `params`, `inputs` in that order. Output uses 2-space indentation, a trailing newline, and no timestamps.

