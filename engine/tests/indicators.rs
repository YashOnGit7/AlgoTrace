// Purpose: checks indicator math and warm-up values against a hand-calculated CSV fixture.
// Connects: documented indicator formulas to the Rust engine's public functions.

mod common;

use algotrace_engine::indicators::{ema, rsi, sma};

/// Compares finite values within the project's non-charge numeric tolerance.
///
/// Example: `assert_close(1.0, 1.0000001)` accepts the tiny floating-point difference.
fn assert_close(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() <= 1.0e-6,
        "{actual} differs from {expected}"
    );
}

/// Checks the SMA, EMA, and RSI values against the small worked fixture.
///
/// Example: the fixture's last SMA(3) is 3.0.
#[test]
fn indicators_match_hand_calculated_fixture_values() {
    let rows = common::read_csv_rows(include_str!("fixtures/indicator_values.csv")).unwrap();
    let closes: Vec<f64> = rows.iter().map(|row| row[0]).collect();
    let expected_sma: Vec<f64> = rows.iter().map(|row| row[1]).collect();
    let expected_ema: Vec<f64> = rows.iter().map(|row| row[2]).collect();
    let expected_rsi: Vec<f64> = rows.iter().map(|row| row[3]).collect();
    let actual_sma = sma(&closes, 3).unwrap();
    let actual_ema = ema(&closes, 3).unwrap();
    let actual_rsi = rsi(&closes, 2).unwrap();
    for (actual, expected) in actual_sma.iter().zip(expected_sma) {
        if expected.is_nan() {
            assert!(actual.is_nan());
        } else {
            assert_close(*actual, expected);
        }
    }
    for (actual, expected) in actual_ema.iter().zip(expected_ema) {
        if expected.is_nan() {
            assert!(actual.is_nan());
        } else {
            assert_close(*actual, expected);
        }
    }
    for (actual, expected) in actual_rsi.iter().zip(expected_rsi) {
        if expected.is_nan() {
            assert!(actual.is_nan());
        } else {
            assert_close(*actual, expected);
        }
    }
}

/// Checks that SMA, EMA, and RSI warm up at their specified first-valid indexes.
///
/// Example: SMA(3) has NaN through index one and a value at index two.
#[test]
fn each_indicator_has_the_specified_warm_up_length() {
    let values = [2.0, 4.0, 6.0, 8.0, 10.0];
    let sma_values = sma(&values, 3).unwrap();
    let ema_values = ema(&values, 3).unwrap();
    let rsi_values = rsi(&values, 2).unwrap();
    assert!(sma_values[..2].iter().all(|value| value.is_nan()));
    assert!(ema_values[..2].iter().all(|value| value.is_nan()));
    assert!(rsi_values[..2].iter().all(|value| value.is_nan()));
    assert!(sma_values[2].is_finite());
    assert!(ema_values[2].is_finite());
    assert!(rsi_values[2].is_finite());
}

/// Checks RSI's specified constant and all-loss edge cases.
///
/// Example: a flat sequence has RSI 50 at its first valid bar.
#[test]
fn rsi_returns_fifty_when_flat_and_zero_when_every_change_is_a_loss() {
    assert_close(rsi(&[5.0, 5.0, 5.0], 2).unwrap()[2], 50.0);
    assert_close(rsi(&[5.0, 4.0, 3.0], 2).unwrap()[2], 0.0);
}
