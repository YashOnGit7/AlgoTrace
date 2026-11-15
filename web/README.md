<!-- Purpose: documents the browser application. Connects: the user canvas and results view to compiler and API. -->
# Web application

This workspace package will host the React Flow canvas, compiler integration, and backtest results screens.

```mermaid
flowchart LR
  User[User] --> Canvas[React canvas]
  Canvas --> Compiler[TypeScript compiler]
  Compiler --> Worker[WASM worker]
  Worker --> Results[Charts and trade results]
  API[FastAPI] --> Data[Daily price files]
```

