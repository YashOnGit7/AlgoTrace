"""Purpose: serves health, symbol, and frozen price-file routes. Connects: the browser to /data."""

from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.price_data import available_symbols, decode_price_file, filter_price_file, symbol_filename

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
LOCAL_WEB_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

app = FastAPI(title="AlgoTrace API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_WEB_ORIGINS,
    allow_methods=["GET"],
    allow_headers=[],
    expose_headers=["X-Bar-Count"],
)


@app.get("/health")
def read_health() -> dict[str, str]:
    """Reports whether the local API process responds.

    Example: a GET to `/health` returns `{"status": "ok"}`.
    """
    return {"status": "ok"}


@app.get("/api/symbols")
def read_symbols() -> dict[str, list[str]]:
    """Lists the supported symbols that have frozen files available.

    Example: a GET to `/api/symbols` returns `{"symbols": ["^NSEI", ...]}`.
    """
    return {"symbols": available_symbols(DATA_DIR)}


@app.get("/api/prices/{symbol}")
def read_prices(
    symbol: str,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
) -> Response:
    """Returns one supported AGT1 file, optionally filtered to inclusive dates.

    Example: a GET to `/api/prices/RELIANCE.NS?from=2020-01-01&to=2020-12-31`
    returns binary bytes and an `X-Bar-Count` response header.
    """
    if start is not None and end is not None and start > end:
        raise HTTPException(status_code=422, detail="The from date must be on or before the to date.")
    try:
        filename = symbol_filename(symbol)
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Unknown symbol.") from error

    path = DATA_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No frozen price file is available for this symbol.")
    try:
        # Read the file per request so this API has no in-memory or external cache layer.
        payload = filter_price_file(path.read_bytes(), start, end)
        bar_count = len(decode_price_file(payload))
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=500, detail="The stored price file is invalid or unreadable.") from error

    return Response(
        content=payload,
        media_type="application/octet-stream",
        headers={"X-Bar-Count": str(bar_count)},
    )
