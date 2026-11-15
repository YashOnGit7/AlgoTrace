//! Purpose: loads dated cost presets and calculates itemized charges for each fill.
//! Connects: simulator buy/sell fills to the user-visible costs breakdown.

use serde::Deserialize;

use crate::types::{ChargeBreakdown, CostPreset, EngineError, EngineResult};

/// Tells the charge calculator which side of an order is being filled.
///
/// Example: `FillSide::Sell` is the only side that receives the DP charge.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FillSide {
    Buy,
    Sell,
}

/// Loads a named preset from the dated JSON file bundled with the engine.
///
/// Example: `load_cost_preset("zerodha_equity_delivery")?` reads the configured delivery charges.
pub fn load_cost_preset(name: &str) -> EngineResult<CostPreset> {
    let file: CostFile = serde_json::from_str(include_str!("../config/cost_presets.json"))
        .map_err(|error| EngineError::new(format!("cost preset file is invalid JSON: {error}")))?;
    match name {
        "zerodha_equity_delivery" => Ok(file.zerodha_equity_delivery),
        "zero_costs" => Ok(file.zero_costs),
        _ => Err(EngineError::new(format!("unknown cost preset {name}"))),
    }
}

/// Calculates every charge for a single fill without rounding intermediate values.
///
/// Example: `calculate_charges(&preset, FillSide::Sell, 100_000.0)?` includes sell STT and DP.
pub fn calculate_charges(
    preset: &CostPreset,
    side: FillSide,
    turnover: f64,
) -> EngineResult<ChargeBreakdown> {
    if !turnover.is_finite() || turnover < 0.0 {
        return Err(EngineError::new(
            "fill turnover must be finite and non-negative",
        ));
    }
    validate_preset(preset)?;
    let brokerage_uncapped = turnover * preset.brokerage_pct / 100.0 + preset.brokerage_flat;
    let brokerage = preset
        .brokerage_max_per_order
        .map_or(brokerage_uncapped, |cap| brokerage_uncapped.min(cap));
    let stt_rate = match side {
        FillSide::Buy => preset.stt_buy_pct,
        FillSide::Sell => preset.stt_sell_pct,
    };
    let stt = turnover * stt_rate / 100.0;
    let transaction = turnover * preset.txn_pct / 100.0;
    let sebi = turnover * preset.sebi_pct / 100.0;
    let stamp_duty = match side {
        FillSide::Buy => turnover * preset.stamp_buy_pct / 100.0,
        FillSide::Sell => 0.0,
    };
    let gst = (brokerage + sebi + transaction) * preset.gst_pct / 100.0;
    let dp = match side {
        FillSide::Buy => 0.0,
        FillSide::Sell => preset.dp_sell_flat,
    };
    Ok(ChargeBreakdown {
        brokerage,
        stt,
        transaction,
        sebi,
        stamp_duty,
        gst,
        dp,
    })
}

/// Rejects negative, non-finite, or invalid capped charge rates before they affect cash.
///
/// Example: a negative STT percentage returns an error instead of increasing cash on a fill.
fn validate_preset(preset: &CostPreset) -> EngineResult<()> {
    let values = [
        preset.brokerage_pct,
        preset.brokerage_flat,
        preset.stt_buy_pct,
        preset.stt_sell_pct,
        preset.txn_pct,
        preset.sebi_pct,
        preset.stamp_buy_pct,
        preset.gst_pct,
        preset.dp_sell_flat,
    ];
    if values
        .iter()
        .any(|value| !value.is_finite() || *value < 0.0)
    {
        return Err(EngineError::new(
            "cost preset rates and fees must be finite and non-negative",
        ));
    }
    if preset
        .brokerage_max_per_order
        .is_some_and(|cap| !cap.is_finite() || cap < 0.0)
    {
        return Err(EngineError::new(
            "brokerage maximum must be finite and non-negative",
        ));
    }
    Ok(())
}

/// Represents the two presets currently included in the JSON configuration.
#[derive(Deserialize)]
struct CostFile {
    zerodha_equity_delivery: CostPreset,
    zero_costs: CostPreset,
}
