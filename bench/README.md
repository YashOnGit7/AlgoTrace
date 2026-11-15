<!-- Purpose: documents benchmark plans and measured outputs. Connects: fixed workloads to reproducible timing results. -->
# Benchmarks

Benchmark results will be recorded only after measurements are run.

```mermaid
flowchart LR
  Workload[Fixed workload] --> WASM[WASM engine]
  Workload --> JS[JavaScript reference]
  Workload --> Python[Python reference]
  WASM --> Report[Measured comparison]
  JS --> Report
  Python --> Report
```

