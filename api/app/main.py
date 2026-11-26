"""Purpose: serves health, symbol, and frozen price-file routes. Connects: the browser to /data."""

from datetime import date
from collections import deque
import logging
from pathlib import Path
from threading import Lock
import time
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.ai_assistant import (
    AssistantProviderError,
    ChatProvider,
    GenerateRequest,
    GenerateResponse,
    get_chat_provider,
    parse_provider_answer,
)
from app.price_data import available_symbols, decode_price_file, filter_price_file, symbol_filename

logger = logging.getLogger("algotrace.ai")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
API_DIR = Path(__file__).resolve().parents[1]
load_dotenv(API_DIR / ".env")
LOCAL_WEB_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
_AI_REQUESTS: dict[str, deque[float]] = {}
_AI_REQUESTS_LOCK = Lock()


def enforce_ai_rate_limit(request: Request) -> None:
    """Allows at most twenty assistant calls per client in a rolling minute.

    Example: the 21st request from one browser address inside sixty seconds gets HTTP 429.
    """
    client_host = request.client.host if request.client is not None else "unknown"
    current = time.monotonic()
    with _AI_REQUESTS_LOCK:
        recent = _AI_REQUESTS.setdefault(client_host, deque())
        while recent and current - recent[0] >= 60.0:
            recent.popleft()
        if len(recent) >= 20:
            raise HTTPException(status_code=429, detail="The assistant is receiving too many requests. Wait a minute and try again.")
        recent.append(current)

app = FastAPI(title="AlgoTrace API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=LOCAL_WEB_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
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


@app.post("/api/generate", response_model=GenerateResponse, dependencies=[Depends(enforce_ai_rate_limit)])
async def generate_strategy(
    body: GenerateRequest,
    provider: Annotated[ChatProvider, Depends(get_chat_provider)],
) -> GenerateResponse:
    """Asks the configured Groq model for full strategy code or a short question.

    Example: a POST with a plain-English request returns validated source in `{code}`.
    """
    try:
        reply = await provider.complete(body)
        return parse_provider_answer(reply)
    except AssistantProviderError as error:
        logger.warning(
            "Groq request failed: reason=%s status=%s code=%s option=%s message=%s",
            error.reason,
            error.status_code,
            error.provider_code,
            error.option,
            error.provider_message or str(error),
        )
        raise HTTPException(status_code=503, detail=str(error)) from error
