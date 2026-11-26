<!-- Purpose: records the first-run controls and reference settings for Strategy Studio. Connects: UI defaults to frozen reference comparisons. -->
# 049: Set useful Strategy Studio defaults

## Context (plain words)
The first Studio view needs sensible settings and should be comparable to the checked-in reference run.

## Options considered
- Start with empty controls and require users to choose every setting.
- Start with RELIANCE.NS, full history, Rs 1,00,000, and Indian charges enabled.

## Decision
Default to RELIANCE.NS, the full available date range, starting capital 100000, and Indian charges enabled. The examples menu includes the three reference strategies and a blank template. When compiling the page config, set slippage to 0 because the Studio exposes no slippage control and the checked-in reference comparison uses zero slippage. Switching charges off selects `zero_costs`.

## Why (beginner level)
These defaults make the page useful immediately, while the zero-cost switch allows a direct comparison with the vectorbt yardstick. Slippage must also match that yardstick for the expected equity to be meaningful.

## Trade-offs
The default displayed result includes Indian charges. The zero-cost reference result requires switching charges off. Users cannot change slippage on this page.

## Interview answer (30 seconds)
The Studio starts with the most-used symbol, all available dates, and a familiar capital amount. Charges are on for realistic rupee costs; turning them off selects the reference's zero-cost setup, including zero slippage.
