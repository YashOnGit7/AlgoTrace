//! Purpose: validates AGT1 price files and returns a borrowed price view.
//! Connects: frozen little-endian binary files to indicator and simulator code without array copies.

use crate::types::{EngineError, EngineResult, PriceField, PriceView};

/// Parses and validates one little-endian AGT1 file without copying its arrays.
///
/// Example: `let prices = read_price_file(&file_bytes)?; assert_eq!(prices.len(), 20);`
pub fn read_price_file(bytes: &[u8]) -> EngineResult<PriceView<'_>> {
    if bytes.len() < 16 {
        return Err(EngineError::new(
            "price file is shorter than its 16-byte header",
        ));
    }
    if &bytes[0..4] != b"AGT1" {
        return Err(EngineError::new("price file magic must be AGT1"));
    }
    let count_bytes: [u8; 4] = bytes[4..8]
        .try_into()
        .expect("header length was checked before reading bar_count");
    let bar_count = u32::from_le_bytes(count_bytes) as usize;
    let expected_len =
        16usize
            .checked_add(bar_count.checked_mul(6 * 8).ok_or_else(|| {
                EngineError::new("bar count is too large for a six-array price file")
            })?)
            .ok_or_else(|| EngineError::new("price file length overflows this platform"))?;
    if bytes.len() != expected_len {
        return Err(EngineError::new(
            "price file length does not match its bar count",
        ));
    }
    let view = PriceView { bytes, bar_count };
    validate_ohlc(view)?;
    Ok(view)
}

/// Rejects non-finite, non-positive, or structurally impossible OHLC values.
///
/// Example: a bar with `high < close` returns an error before it can reach the backtest.
fn validate_ohlc(view: PriceView<'_>) -> EngineResult<()> {
    let mut previous_timestamp = None;
    for bar in 0..view.len() {
        let timestamp = view.timestamp(bar)?;
        if !timestamp.is_finite()
            || previous_timestamp.is_some_and(|previous| timestamp <= previous)
        {
            return Err(EngineError::new(format!(
                "timestamp at bar {bar} must be finite and strictly increasing"
            )));
        }
        previous_timestamp = Some(timestamp);
        let open = view.value(PriceField::Open, bar)?;
        let high = view.value(PriceField::High, bar)?;
        let low = view.value(PriceField::Low, bar)?;
        let close = view.value(PriceField::Close, bar)?;
        let values = [open, high, low, close];
        if values
            .iter()
            .any(|value| !value.is_finite() || *value <= 0.0)
        {
            return Err(EngineError::new(format!(
                "OHLC bar {bar} contains a non-finite or non-positive price"
            )));
        }
        if high < low {
            return Err(EngineError::new(format!(
                "OHLC bar {bar} has high below low"
            )));
        }
        let volume = view.value(PriceField::Volume, bar)?;
        if !volume.is_finite() || volume < 0.0 {
            return Err(EngineError::new(format!(
                "volume at bar {bar} must be finite and non-negative"
            )));
        }
    }
    Ok(())
}
