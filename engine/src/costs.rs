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

/// Loads and validates a bundled named preset from the dated JSON file. Custom presets are supplied in config.
///
/// Example: `load_cost_preset("zerodha_equity_delivery")?` reads the delivery charges; `custom` is not a bundled name.
pub fn load_cost_preset(name: &str) -> EngineResult<CostPreset> {
    let file: CostFile = serde_json::from_str(include_str!("../config/cost_presets.json"))
        .map_err(|error| EngineError::new(format!("cost preset file is invalid JSON: {error}")))?;
    let preset = match name {
        "zerodha_equity_delivery" => Ok(file.zerodha_equity_delivery),
        "zero_costs" => Ok(file.zero_costs),
        _ => Err(EngineError::new(format!(
            "unknown bundled cost preset {name}"
        ))),
    }?;
    validate_preset(&preset)?;
    Ok(preset)
}

/// Converts percentage-point fields to fractional rates once for a backtest run.
pub(crate) fn prepare_cost_preset(preset: &CostPreset) -> EngineResult<CostRates> {
    validate_preset(preset)?;
    Ok(CostRates {
        brokerage_rate: preset.brokerage_pct / 100.0,
        brokerage_flat: preset.brokerage_flat,
        brokerage_max_per_order: preset.brokerage_max_per_order,
        stt_buy_rate: preset.stt_buy_pct / 100.0,
        stt_sell_rate: preset.stt_sell_pct / 100.0,
        txn_rate: preset.txn_pct / 100.0,
        sebi_rate: preset.sebi_pct / 100.0,
        stamp_buy_rate: preset.stamp_buy_pct / 100.0,
        gst_rate: preset.gst_pct / 100.0,
        dp_sell_flat: preset.dp_sell_flat,
    })
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct CostRates {
    brokerage_rate: f64,
    brokerage_flat: f64,
    brokerage_max_per_order: Option<f64>,
    stt_buy_rate: f64,
    stt_sell_rate: f64,
    txn_rate: f64,
    sebi_rate: f64,
    stamp_buy_rate: f64,
    gst_rate: f64,
    dp_sell_flat: f64,
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
    let rates = prepare_cost_preset(preset)?;
    Ok(calculate_charges_with_rates(&rates, side, turnover))
}

pub(crate) fn calculate_charges_with_rates(
    preset: &CostRates,
    side: FillSide,
    turnover: f64,
) -> ChargeBreakdown {
    let brokerage_uncapped = turnover * preset.brokerage_rate + preset.brokerage_flat;
    let brokerage = preset
        .brokerage_max_per_order
        .map_or(brokerage_uncapped, |cap| brokerage_uncapped.min(cap));
    let stt_rate = match side {
        FillSide::Buy => preset.stt_buy_rate,
        FillSide::Sell => preset.stt_sell_rate,
    };
    let stt = turnover * stt_rate;
    let transaction = turnover * preset.txn_rate;
    let sebi = turnover * preset.sebi_rate;
    let stamp_duty = match side {
        FillSide::Buy => turnover * preset.stamp_buy_rate,
        FillSide::Sell => 0.0,
    };
    let gst = (brokerage + sebi + transaction) * preset.gst_rate;
    let dp = match side {
        FillSide::Buy => 0.0,
        FillSide::Sell => preset.dp_sell_flat,
    };
    ChargeBreakdown {
        brokerage,
        stt,
        transaction,
        sebi,
        stamp_duty,
        gst,
        dp,
    }
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
