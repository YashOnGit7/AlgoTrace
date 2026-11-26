"""Purpose: checks local Groq credentials and request compatibility. Connects: api/.env to one small Groq chat request."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
import sys

import httpx
from dotenv import load_dotenv

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))
URL = "https://api.groq.com/openai/v1/chat/completions"


def classify(status: int, code: str | None, message: str | None) -> tuple[str, str | None]:
    """Returns the same user-facing category and offending option as the API.

    Example: a 400 mentioning `include_reasoning` is reported as an unsupported option.
    """
    from app.ai_assistant import classify_groq_error

    return classify_groq_error(status, code, message)


async def main() -> int:
    """Loads local settings, sends one tiny request, and prints redacted diagnostics.

    Example: running this script never prints the API key, only its configured length.
    """
    load_dotenv(API_DIR / ".env", override=True)
    key = os.getenv("GROQ_API_KEY", "").strip()
    model = os.getenv("GROQ_MODEL", "").strip()
    print(f"GROQ_API_KEY set: {'yes' if key else 'no'}")
    print(f"GROQ_API_KEY length: {len(key)}")
    print(f"GROQ_MODEL set: {'yes' if model else 'no'}")
    if not key:
        print("HTTP status: not sent")
        print("Groq error code: none")
        print("Groq error message: none")
        print("Result: key missing")
        return 1
    if not model:
        print("HTTP status: not sent")
        print("Groq error code: none")
        print("Groq error message: none")
        print("Result: model name missing")
        return 1

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with the single word OK."}],
        "reasoning_effort": "low",
        "include_reasoning": False,
        "max_completion_tokens": 2_048,
        "temperature": 0.2,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:
            response = await client.post(URL, headers={"Authorization": f"Bearer {key}"}, json=payload)
    except httpx.TimeoutException:
        print("HTTP status: none (timeout)")
        print("Groq error code: none")
        print("Groq error message: request timed out after 20 seconds")
        print("Result: timeout")
        return 1
    except httpx.RequestError as error:
        safe_error = str(error).replace(key, "[redacted]")
        print("HTTP status: none (network failure)")
        print("Groq error code: none")
        print(f"Groq error message: {safe_error}")
        print("Result: network failure")
        return 1

    code: str | None = None
    message: str | None = None
    content: object = None
    try:
        body = response.json()
        if response.is_error:
            error = body.get("error", {}) if isinstance(body, dict) else {}
            if isinstance(error, dict):
                code = str(error["code"]) if error.get("code") is not None else None
                message = str(error["message"]) if error.get("message") is not None else None
        else:
            content = body["choices"][0]["message"].get("content")
    except (ValueError, TypeError, KeyError, IndexError):
        pass
    if message:
        message = message.replace(key, "[redacted]")
    print(f"HTTP status: {response.status_code}")
    print(f"Groq error code: {code or 'none'}")
    print(f"Groq error message: {message or 'none'}")
    if response.is_error:
        category, option = classify(response.status_code, code, message)
        labels = {
            "key_rejected": "key rejected",
            "model_unavailable": "model unknown or not allowed",
            "unsupported_option": "unsupported request option",
            "rate_limit": "rate limit",
            "network_failure": "network failure",
            "timeout": "timeout",
            "empty_reply": "empty reply",
            "provider_failure": "other Groq provider failure",
        }
        print(f"Result: {labels[category]}" + (f" (option: {option})" if option else ""))
        return 1
    if not isinstance(content, str) or not content.strip():
        print("Result: empty reply")
        return 1
    print("Result: success (reply received)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
