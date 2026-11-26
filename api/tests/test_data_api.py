"""Purpose: verifies FastAPI route behavior and configuration. Connects: browser routes to frozen files."""

from datetime import date
from pathlib import Path
import tempfile

import pytest
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import Headers

from app import main
from app.price_data import PriceBar, decode_price_file, encode_price_file, utc_midnight


@pytest.fixture
def isolated_data_dir(monkeypatch):
    """Uses a short-lived data folder inside the checked-out API test directory.

    Example: a route test writes a fixture file that is removed when the test ends.
    """
    with tempfile.TemporaryDirectory(prefix=".data-test-", dir=Path(__file__).parent) as folder:
        data_dir = Path(folder)
        monkeypatch.setattr(main, "DATA_DIR", data_dir)
        yield data_dir


def sample_bars() -> list[PriceBar]:
    """Builds three known bars for endpoint tests.

    Example: `sample_bars()[0]` is the first of three consecutive daily records.
    """
    return [
        PriceBar(utc_midnight(date(2024, 1, 2)), 10.0, 11.0, 9.0, 10.5, 100.0),
        PriceBar(utc_midnight(date(2024, 1, 3)), 10.5, 12.0, 10.0, 11.5, 120.0),
        PriceBar(utc_midnight(date(2024, 1, 4)), 11.5, 13.0, 11.0, 12.5, 140.0),
    ]


def test_health_endpoint_reports_ok() -> None:
    """Return a small JSON status from the health route.

    Example: calling the `/health` endpoint returns `status` equal to `ok`.
    """
    assert main.read_health() == {"status": "ok"}
    assert any(route.path == "/health" for route in main.app.routes)


def test_symbols_endpoint_lists_only_files_that_exist(isolated_data_dir: Path) -> None:
    """Show available symbols, not a hard-coded list of missing data.

    Example: one NIFTY file makes `^NSEI` appear in the endpoint response.
    """
    (isolated_data_dir / "NIFTY_50.agt1").write_bytes(encode_price_file(sample_bars()))

    assert main.read_symbols() == {"symbols": ["^NSEI"]}
    assert any(route.path == "/api/symbols" for route in main.app.routes)


def test_prices_endpoint_returns_filtered_binary_and_bar_count(isolated_data_dir: Path) -> None:
    """Serve inclusive date filters as AGT1 bytes with a browser-readable count header.

    Example: Jan 3 through Jan 4 returns two bars and `X-Bar-Count: 2`.
    """
    (isolated_data_dir / "RELIANCE.agt1").write_bytes(encode_price_file(sample_bars()))

    response = main.read_prices("RELIANCE.NS", date(2024, 1, 3), date(2024, 1, 4))

    assert response.status_code == 200
    assert response.media_type == "application/octet-stream"
    assert response.headers["x-bar-count"] == "2"
    assert [bar.close for bar in decode_price_file(response.body)] == [11.5, 12.5]
    price_route = next(route for route in main.app.routes if route.path == "/api/prices/{symbol}")
    assert {parameter.alias for parameter in price_route.dependant.query_params} == {"from", "to"}


def test_prices_endpoint_rejects_unknown_symbols_and_reversed_dates() -> None:
    """Reject unsupported symbols and invalid date ranges with client errors.

    Example: a start date after the end date raises HTTP 422.
    """
    with pytest.raises(HTTPException) as unknown:
        main.read_prices("UNKNOWN.NS", None, None)
    with pytest.raises(HTTPException) as reversed_range:
        main.read_prices("RELIANCE.NS", date(2024, 2, 2), date(2024, 1, 1))

    assert unknown.value.status_code == 404
    assert reversed_range.value.status_code == 422


def test_cors_allows_only_local_vite_web_origins_and_exposes_bar_count() -> None:
    """Keep browser access limited to the two local web development origins.

    Example: an origin at `https://example.com` is not listed as an allowed origin.
    """
    cors = next(middleware for middleware in main.app.user_middleware if middleware.cls is CORSMiddleware)

    assert cors.kwargs["allow_origins"] == ["http://localhost:5173", "http://127.0.0.1:5173"]
    assert cors.kwargs["allow_methods"] == ["GET", "POST"]
    assert cors.kwargs["allow_headers"] == ["Content-Type"]
    assert cors.kwargs["expose_headers"] == ["X-Bar-Count"]


@pytest.mark.parametrize("origin", ["http://127.0.0.1:5173", "http://localhost:5173"])
def test_cors_adds_allow_origin_to_post_response(origin: str) -> None:
    """Check CORS on a completed POST response, not only on the preflight path.

    Example: a browser POST from either configured Vite origin receives its own
    `Access-Control-Allow-Origin` header on the 200 response.
    """
    cors_settings = next(middleware.kwargs for middleware in main.app.user_middleware if middleware.cls is CORSMiddleware)
    cors = CORSMiddleware(lambda scope, receive, send: None, **cors_settings)

    async def send_post():
        messages = []

        async def send(message):
            messages.append(message)

        request_headers = Headers(raw=[(b"origin", origin.encode()), (b"content-type", b"application/json")])
        await cors.send(
            {"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]},
            send,
            request_headers,
        )
        return messages

    coroutine = send_post()
    try:
        coroutine.send(None)
    except StopIteration as complete:
        response_messages = complete.value
    else:
        pytest.fail("CORS response header check unexpectedly waited on asynchronous I/O")
    start = next(message for message in response_messages if message["type"] == "http.response.start")
    headers = {key.decode().lower(): value.decode() for key, value in start["headers"]}

    assert start["status"] == 200
    assert headers["access-control-allow-origin"] == origin
