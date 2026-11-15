<!-- Purpose: documents engine integration tests and fixture data. Connects: hand calculations and randomized cases to public engine behavior. -->
# Engine tests

Integration tests exercise the public API with small, hand-checkable CSV fixtures and property-generated price series.

```mermaid
flowchart LR
  Fixture[CSV fixtures] --> Encode[AGT1 test encoder]
  Encode --> Engine[Engine public API]
  Random[proptest bars] --> Engine
  Engine --> Assert[Trades, equity, charges, signals, metrics]
```

