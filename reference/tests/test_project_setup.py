"""Purpose: checks that the reference test environment imports its numeric tools. Connects: dependency setup to pytest."""


def test_the_reference_environment_imports_pandas_and_vectorbt() -> None:
    """Verify both planned reference tools are available.

    Example: running pytest in this folder passes when pandas and vectorbt import.
    """
    import pandas
    import vectorbt

    assert pandas.__version__
    assert vectorbt.__version__

