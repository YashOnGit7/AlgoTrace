"""Purpose: checks reference indicators and crossover rules against `/spec`.
Connects: vectorbt order inputs and Rust Strategy ASTs to shared signal definitions.
"""

import numpy as np
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.compare_vectorbt import crosses_above, crosses_below, rsi_spec, sma_spec


def test_sma_matches_spec_warmup_and_rolling_values() -> None:
    """SMA is NaN until a complete window and then uses the arithmetic mean.

    Example: period two over `[1, 2, 3]` gives `[NaN, 1.5, 2.5]`.
    """
    result = sma_spec(np.array([1.0, 2.0, 3.0]), 2)

    assert np.isnan(result[0])
    np.testing.assert_array_equal(result[1:], np.array([1.5, 2.5]))


def test_rsi_uses_spec_seed_and_flat_series_rules() -> None:
    """RSI starts at its period index and defines all-gain and flat-series cases.

    Example: period two over `[1, 2, 3]` first becomes 100 at index two.
    """
    increasing = rsi_spec(np.array([1.0, 2.0, 3.0]), 2)
    flat = rsi_spec(np.array([5.0, 5.0, 5.0]), 2)

    assert np.isnan(increasing[:2]).all()
    assert increasing[2] == 100.0
    assert flat[2] == 50.0


def test_crossovers_require_both_values_on_both_adjacent_bars() -> None:
    """Crosses are false during warm-up and true only on a valid transition.

    Example: `[NaN, 1, 3]` crosses above `[0, 2, 2]` only at the final bar.
    """
    left = np.array([np.nan, 1.0, 3.0, 1.0])
    right = np.array([0.0, 2.0, 2.0, 2.0])

    np.testing.assert_array_equal(crosses_above(left, right), [False, False, True, False])
    np.testing.assert_array_equal(crosses_below(left, right), [False, False, False, True])
