<!-- Purpose: defines charge presets and their calculation inputs. Connects: engine fills to itemized trading costs. -->
# Costs

Preset `zerodha_equity_delivery`, as of `2026-11-14`, source: https://www.zerodha.com/charges

- brokerage: 0
- STT: 0.1% on buy and sell turnover
- NSE transaction charge: 0.00307% of turnover
- SEBI fee: Rs 10 per crore (0.0001%)
- stamp duty: 0.015% on buy turnover only
- GST: 18% on (brokerage + SEBI fee + transaction charge)
- DP charge: Rs 15.34 flat per sell order (already includes GST; do not add GST again)

Preset fields: `brokerage_pct`, `brokerage_flat`, optional `brokerage_max_per_order`, `stt_buy_pct`, `stt_sell_pct`, `txn_pct`, `sebi_pct`, `stamp_buy_pct`, `gst_pct`, `dp_sell_flat`. Other presets: `zero_costs`, `custom`.

Values in fields ending in `_pct` are percentage points: `0.1` means 0.1%, so the engine divides these values by 100 when calculating a charge.

The engine does not round charges internally; each charge is computed per fill. Displayed charges are rounded to 2 decimals (paise). Engine calculations use `f64` throughout and do not round to tick size.

Tests use a tolerance of Rs 0.01 for charges and `1e-6` for everything else.

Check: buying Rs 1,00,000 and selling Rs 1,00,000 gives STT 200, stamp 15, transaction 6.14, SEBI 0.20, GST 1.1412, DP 15.34, total 237.8212.

