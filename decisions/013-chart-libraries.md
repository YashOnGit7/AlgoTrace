<!-- Purpose: records the charting library split. Connects: result visualization needs to the fixed frontend stack. -->
# 013: Lightweight Charts plus Plotly for heatmaps only

## Context (plain words)
The results page needs financial time-series charts and a parameter-sweep heatmap.

## Options considered
- TradingView Lightweight Charts for time series and Plotly only for heatmaps.
- Use Plotly for all charts.

## Decision
Use TradingView Lightweight Charts for market and equity series; use Plotly.js only for heatmaps.

## Why (beginner level)
The fixed stack assigns each library a clear job.

## Trade-offs
The app must maintain two charting integrations.

## Interview answer (30 seconds)
We use Lightweight Charts for price and equity over time, and reserve Plotly for heatmaps. This follows the fixed stack and keeps the chart roles clear.

