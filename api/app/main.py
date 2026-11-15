"""Purpose: provides the initial FastAPI app. Connects: local HTTP requests to the future data and AI routes."""

from fastapi import FastAPI

app = FastAPI(title="AlgoTrace API")


@app.get("/health")
def read_health() -> dict[str, str]:
    """Report whether the local API process responds.

    Example: a GET to `/health` returns `{"status": "ok"}`.
    """
    return {"status": "ok"}

