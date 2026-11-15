<!-- Purpose: documents AI sentence-to-graph evaluation. Connects: example requests to compiler validation outcomes. -->
# AI evaluation

This folder will contain example sentences and a runner for checking generated graphs.

```mermaid
flowchart LR
  Sentence[Plain-language request] --> Model[AI through FastAPI]
  Model --> Graph[Graph JSON]
  Graph --> Compiler[Compiler validation]
  Compiler --> Result[Accepted or clear error]
```

