//! Purpose: calculates SMA, EMA, and RSI series with the specified warm-up behavior.
//! Connects: price and math series from the evaluator to strategy signals.

use crate::types::{EngineError, EngineResult};

/// Calculates the rolling mean, using NaN before a full window is available.
///
/// Example: `sma(&[1.0, 2.0, 3.0], 2)?` returns `[NaN, 1.5, 2.5]`.
pub fn sma(values: &[f64], period: usize) -> EngineResult<Vec<f64>> {
    let mut output = Vec::new();
    sma_into(values, period, &mut output)?;
    Ok(output)
}

/// Fills a caller-owned SMA buffer, retaining its allocation for sweeps.
///
/// Example: `sma_into(&[1.0, 2.0, 3.0], 2, &mut scratch)?` reuses `scratch` when possible.
pub fn sma_into(values: &[f64], period: usize, output: &mut Vec<f64>) -> EngineResult<()> {
    validate_period(period)?;
    output.resize(values.len(), f64::NAN);
    output.fill(f64::NAN);
    for end in period..=values.len() {
        let window = &values[end - period..end];
        if !window.iter().any(|value| value.is_nan()) {
            output[end - 1] = window.iter().sum::<f64>() / period as f64;
        }
    }
    Ok(())
}

/// Calculates an EMA seeded by the first period's simple moving average.
///
/// Example: `ema(&[1.0, 2.0, 3.0, 4.0], 3)?` returns `[NaN, NaN, 2.0, 3.0]`.
pub fn ema(values: &[f64], period: usize) -> EngineResult<Vec<f64>> {
    let mut output = Vec::new();
    ema_into(values, period, &mut output)?;
    Ok(output)
}

/// Fills a caller-owned EMA buffer, retaining its allocation for sweeps.
///
/// Example: `ema_into(&prices, 3, &mut scratch)?` writes the SMA-seeded EMA into `scratch`.
pub fn ema_into(values: &[f64], period: usize, output: &mut Vec<f64>) -> EngineResult<()> {
    validate_period(period)?;
    output.resize(values.len(), f64::NAN);
    output.fill(f64::NAN);
    if values.len() < period {
        return Ok(());
    }
    let seed = values[..period].iter().sum::<f64>() / period as f64;
    output[period - 1] = seed;
    let alpha = 2.0 / (period as f64 + 1.0);
    for index in period..values.len() {
        output[index] = alpha * values[index] + (1.0 - alpha) * output[index - 1];
    }
    Ok(())
}

/// Calculates Wilder-smoothed RSI with a simple-average seed at index `period`.
///
/// Example: `rsi(&[1.0, 2.0, 3.0], 2)?[2]` is `100.0` because both changes are gains.
pub fn rsi(values: &[f64], period: usize) -> EngineResult<Vec<f64>> {
    let mut output = Vec::new();
    rsi_into(values, period, &mut output)?;
    Ok(output)
}

/// Fills a caller-owned RSI buffer, retaining its allocation for sweeps.
///
/// Example: `rsi_into(&closes, 14, &mut scratch)?` reuses the RSI output vector.
pub fn rsi_into(values: &[f64], period: usize, output: &mut Vec<f64>) -> EngineResult<()> {
    validate_period(period)?;
    if period < 2 {
        return Err(EngineError::new("RSI period must be at least 2"));
    }
    output.resize(values.len(), f64::NAN);
    output.fill(f64::NAN);
    if values.len() <= period {
        return Ok(());
    }

    let mut average_gain = 0.0;
    let mut average_loss = 0.0;
    for index in 1..=period {
        let change = values[index] - values[index - 1];
        let (gain, loss) = gain_loss(change);
        average_gain += gain;
        average_loss += loss;
    }
    average_gain /= period as f64;
    average_loss /= period as f64;
    output[period] = rsi_value(average_gain, average_loss);

    for index in (period + 1)..values.len() {
        let change = values[index] - values[index - 1];
        let (gain, loss) = gain_loss(change);
        average_gain = (average_gain * (period as f64 - 1.0) + gain) / period as f64;
        average_loss = (average_loss * (period as f64 - 1.0) + loss) / period as f64;
        output[index] = rsi_value(average_gain, average_loss);
    }
    Ok(())
}

/// Separates a price change into its positive gain and loss parts while preserving NaN.
///
/// Example: `gain_loss(-2.0)` returns `(0.0, 2.0)`.
fn gain_loss(change: f64) -> (f64, f64) {
    if change.is_nan() {
        (f64::NAN, f64::NAN)
    } else {
        (change.max(0.0), (-change).max(0.0))
    }
}

/// Converts Wilder's average gains and losses into the RSI value.
///
/// Example: `rsi_value(0.0, 0.0)` returns `50.0` for an unchanged series.
fn rsi_value(average_gain: f64, average_loss: f64) -> f64 {
    if average_gain == 0.0 && average_loss == 0.0 {
        50.0
    } else if average_loss == 0.0 {
        100.0
    } else {
        100.0 - 100.0 / (1.0 + average_gain / average_loss)
    }
}

/// Rejects a zero-sized window that cannot define an indicator.
///
/// Example: `validate_period(0)` returns an error instead of dividing by zero.
fn validate_period(period: usize) -> EngineResult<()> {
    if period == 0 {
        return Err(EngineError::new(
            "indicator period must be greater than zero",
        ));
    }
    Ok(())
}
