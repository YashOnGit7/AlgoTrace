<!-- Purpose: documents independent Python reference calculations. Connects: strategy fixtures to comparison results. -->
# Reference calculations

This module will compare selected engine results with pandas and vectorbt and a Zerodha-style charges calculator.

```mermaid
flowchart LR
  Fixture[Strategy and bars] --> Engine[Rust engine result]
  Fixture --> Reference[Python reference]
  Engine --> Compare[Compare with tolerances]
  Reference --> Compare
```

