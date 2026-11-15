"""Purpose: checks that the API test environment can import its web framework. Connects: initial setup to pytest."""


def test_the_api_environment_imports_fastapi() -> None:
    """Verify the API dependency is installed.

    Example: running pytest in this folder passes when FastAPI is available.
    """
    import fastapi

    assert fastapi.__version__

