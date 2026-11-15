<!-- Purpose: defines the binary price-file layout. Connects: frozen NSE files to FastAPI and the browser engine. -->
# Price file format (little-endian)

16-byte header: magic bytes `AGT1`, `u32 bar_count`, 8 reserved bytes. Then six consecutive arrays of `f64`, each `bar_count` long: timestamp (Unix seconds), open, high, low, close, volume.

Reject a run if any open, high, low, or close value is non-finite, is not positive, or violates `low <= open <= high` or `low <= close <= high`.
