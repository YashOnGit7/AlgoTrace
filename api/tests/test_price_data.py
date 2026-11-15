"""Purpose: checks AGT1 byte layout and download quality handling. Connects: the data script to the engine spec."""

from datetime import date
from pathlib import Path
import tempfile

import pytest

from app.price_data import (
    PriceBar,
    clean_downloaded_bars,
    decode_price_file,
    encode_price_file,
    remove_junk_holiday_bars,
    utc_midnight,
)


def test_binary_price_file_round_trips_six_column_arrays() -> None:
    """Keep the 16-byte header and all six arrays in spec order.

    Example: encode and decode a daily bar and compare every field.
    """
    source = [
        PriceBar(utc_midnight(date(2024, 1, 2)), 10.0, 12.0, 9.0, 11.0, 100.0),
        PriceBar(utc_midnight(date(2024, 1, 3)), 11.0, 13.0, 10.0, 12.0, 0.0),
    ]
    encoded = encode_price_file(source)

    assert len(encoded) == 16 + 2 * 6 * 8
    assert encoded[:4] == b"AGT1"
    assert decode_price_file(encoded) == source


def test_removes_zero_volume_flat_bar_from_fake_files_with_rounding_noise() -> None:
    """Treat a tiny relative OHLC difference as flat when all present stocks are zero-volume.

    Example: a fake AGT1 file with high slightly above low is removed when the
    relative high-low and open-close differences stay within 1e-9.
    """
    timestamp = utc_midnight(date(2014, 10, 15))
    with tempfile.TemporaryDirectory(prefix=".rounding-test-", dir=Path(__file__).parent) as folder:
        fake_dir = Path(folder)
        noisy_path = fake_dir / "RELIANCE.agt1"
        flat_path = fake_dir / "TCS.agt1"
        noisy_path.write_bytes(
            encode_price_file([PriceBar(timestamp, 100.0, 100.00000001, 100.0, 100.00000001, 0.0)])
        )
        flat_path.write_bytes(encode_price_file([PriceBar(timestamp, 200.0, 200.0, 200.0, 200.0, 0.0)]))

        cleaned, removed_dates = remove_junk_holiday_bars(
            {
                "RELIANCE.NS": decode_price_file(noisy_path.read_bytes()),
                "TCS.NS": decode_price_file(flat_path.read_bytes()),
            }
        )

        assert removed_dates == ("2014-10-15",)
        assert cleaned == {"RELIANCE.NS": [], "TCS.NS": []}
        cleaned_again, removed_again = remove_junk_holiday_bars(cleaned)
        assert cleaned_again == cleaned
        assert removed_again == ()


def test_download_quality_removes_invalid_rows_and_keeps_last_duplicate() -> None:
    """Remove broken bars and resolve duplicate dates before writing a frozen file.

    Example: a duplicate timestamp keeps the last valid close for that date.
    """
    first_day = utc_midnight(date(2024, 1, 2))
    bars = [
        PriceBar(first_day, 10.0, 11.0, 9.0, 10.0, 100.0),
        PriceBar(first_day, 10.0, 12.0, 9.0, 11.0, 100.0),
        PriceBar(utc_midnight(date(2024, 1, 3)), 0.0, 11.0, 9.0, 10.0, 100.0),
        PriceBar(utc_midnight(date(2024, 1, 4)), 10.0, 9.0, 10.0, 10.0, 100.0),
    ]

    cleaned, report = clean_downloaded_bars(bars)

    assert len(cleaned) == 1
    assert cleaned[0].close == 11.0
    assert report.duplicate_dates == ("2024-01-02",)
    assert len(report.invalid_rows) == 2


@pytest.mark.parametrize(
    ("bad_bar", "problem"),
    [
        (PriceBar(0, 0.0, 2.0, 1.0, 1.5, 1.0), "non-positive"),
        (PriceBar(0, 1.0, 2.0, 1.0, 1.5, -1.0), "negative volume"),
        (PriceBar(0, 1.0, 2.0, 1.0, float("nan"), 1.0), "non-finite"),
        (PriceBar(0, 1.0, 1.0, 2.0, 1.5, 1.0), "high below low"),
    ],
)
def test_download_quality_excludes_each_invalid_bar_kind(bad_bar: PriceBar, problem: str) -> None:
    """Exclude bars that would violate the engine's input requirements.

    Example: a NaN close is reported and does not appear in the cleaned output.
    """
    cleaned, report = clean_downloaded_bars([bad_bar])

    assert cleaned == []
    assert problem in report.invalid_rows[0]


def test_download_quality_reports_missing_weekday_candidates_without_filling_them() -> None:
    """Report absent weekdays without inventing prices for holidays or gaps.

    Example: missing Monday between Friday and Tuesday appears in the report.
    """
    bars = [
        PriceBar(utc_midnight(date(2024, 1, 5)), 10.0, 11.0, 9.0, 10.0, 1.0),
        PriceBar(utc_midnight(date(2024, 1, 9)), 10.0, 11.0, 9.0, 10.0, 1.0),
    ]

    cleaned, report = clean_downloaded_bars(bars)

    assert len(cleaned) == 2
    assert report.missing_weekdays == ("2024-01-08",)
