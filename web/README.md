<!-- Purpose: documents the browser application. Connects: the user canvas and results view to compiler and API. -->
# Web application

This workspace package hosts the React app and a typed wrapper for the wasm-bindgen engine API. The wrapper expects an initialized generated WASM module; wiring the module into a worker and results screen is still pending.

```mermaid
flowchart LR
  User[User] --> Canvas[React canvas]
  Canvas --> Compiler[TypeScript compiler]
  Compiler --> Worker[WASM worker]
  Worker --> Results[Charts and trade results]
  API[FastAPI] --> Data[Daily price files]
  Data -->|AGT1 bytes, copied once| Wasm[WASM price allocation]
  Wasm -->|fresh typed-array views| Results
```

