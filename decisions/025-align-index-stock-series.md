<!-- Purpose: defines date alignment when comparing the index with an individual stock. Connects: unequal frozen calendars to reliable cross-market comparisons. -->
# 025: Align index and stock data by timestamp

## Context (plain words)
The frozen `^NSEI` index file has 4,142 bars, while each cleaned stock file has 4,160 bars. The files have the same first and last dates but not the same dates in between. Index and stock bars at the same array position can therefore refer to different dates.

## Options considered
- Compare the index and stock by bar position.
- Join by timestamp and forward-fill the most recent index close when an index bar is missing for a stock date.
- Remove every date that is absent from either file.

## Decision
Any comparison between the index and a stock joins on timestamp. On a stock date without an index bar, use the latest earlier index close (forward-fill). Never align the two series by bar position. The engine's own buy-and-hold benchmark uses the same stock as the strategy, so this index alignment rule does not affect it.

## Why (beginner level)
The two files do not have matching row counts or calendars. Joining by the date keeps each stock price paired with the index value for the same day; carrying the last known index close handles dates when the index file has no row.

## Trade-offs
Date alignment avoids pairing prices from different days, but forward-filled index values are carried observations rather than new index trades. Any future comparison code needs to apply this rule explicitly.

## Interview answer (30 seconds)
The index file has fewer dates than each stock file, so I never compare array positions. I join on the timestamp and carry the last index close forward when the index has no bar on a stock date. The engine's buy-and-hold benchmark follows the traded stock itself, so it is unchanged.
