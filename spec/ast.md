<!-- Purpose: defines the versioned Strategy AST and its canonical JSON serialization. Connects: compiler output to the Rust engine input. -->
# Strategy AST (JSON)

Fields: `version` (integer 1); `config`: `initial_capital`, `slippage_pct`, cost preset object, `force_close_at_end`, `risk_free_rate`, `trading_days_per_year`; `nodes`: list in dependency order, each with `id`, `op`, `params`, `inputs` (port name -> node id); `sink`: id of the `STRATEGY` node.

The same graph must always give byte-identical JSON. Order nodes with Kahn's algorithm; among nodes ready at the same time, take the smallest `id` (plain string comparison). When duplicate nodes merge, the node with the smallest `id` survives. JSON keys appear in this fixed order: `id`, `op`, `params`, `inputs`; keys inside `params` and `inputs` are sorted alphabetically. Output uses 2-space indentation, a trailing newline, and no timestamps.

