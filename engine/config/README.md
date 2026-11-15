<!-- Purpose: documents versioned engine configuration data. Connects: dated market cost presets to cost calculations. -->
# Engine configuration

This folder contains cost presets as data, including the date and source for rates.

```mermaid
flowchart LR
  Preset[Cost preset JSON] --> Engine[Engine cost calculation]
  Engine --> Receipt[Per-fill charge breakdown]
```

