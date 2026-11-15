<!-- Purpose: documents frozen market-data provenance. Connects: downloaded source data to the binary format served by the API. -->
# Frozen data

This folder will hold frozen daily NSE price files and a provenance record. No market-data files are present yet.

```mermaid
flowchart LR
  Source[One-time source download] --> Frozen[Frozen daily file]
  Frozen --> Binary[AGT1 binary format]
  Binary --> API[FastAPI serves bytes]
  API --> Browser[Browser engine]
```

