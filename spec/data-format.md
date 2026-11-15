<!-- Purpose: defines the binary price-file layout. Connects: frozen NSE files to FastAPI and the browser engine. -->
# Price file format (little-endian)

16-byte header: magic bytes `AGT1`, `u32 bar_count`, 8 reserved bytes. Then six consecutive arrays of `f64`, each `bar_count` long: timestamp (Unix seconds), open, high, low, close, volume.

The loader rejects a file containing non-finite values (including NaN), any OHLC price that is not positive, `high < low`, or timestamps that are not strictly increasing. Volume may be 0; it must be finite and non-negative. The engine never receives invalid bars.
