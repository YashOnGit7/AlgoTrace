<!-- Purpose: explains where normative project behavior is defined. Connects: compiler, engine, API, and UI. -->
# Specifications

Files here define the formats and behavior that implementations must follow.

```mermaid
flowchart LR
  Nodes[Node catalog and types] --> Compiler[TypeScript compiler]
  AST[Strategy AST] --> Engine[Rust engine]
  Costs[Cost rules] --> Engine
  Data[Price format] --> API[FastAPI data service]
  Engine --> Metrics[Metrics and trades]
```

