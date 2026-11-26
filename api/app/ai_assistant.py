"""Purpose: builds safe Groq prompts and validates assistant replies. Connects: strategy-language source, Groq chat completions, and API schemas."""

from __future__ import annotations

import re
import os
import logging
from pathlib import Path
from typing import AsyncIterator, Protocol

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
STRATEGY_SPEC = REPOSITORY_ROOT / "spec" / "strategy-language.md"
EXAMPLE_DIR = REPOSITORY_ROOT / "spec" / "examples"
GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"


class GenerateRequest(BaseModel):
    """Carries a plain-language request and optional code-repair context.

    Example: `GenerateRequest(text="Buy when close is above its average")` is a first request.
    """

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=2_000)
    previous_code: str | None = Field(default=None, max_length=20_000)
    errors: list[str] | None = Field(default=None, max_length=30)


class GenerateResponse(BaseModel):
    """Returns either complete strategy source or one clarifying question.

    Example: `GenerateResponse(code="buy when close > 1\\nsell when close < 1")` contains source.
    """

    model_config = ConfigDict(extra="forbid")

    code: str | None = Field(default=None, min_length=1, max_length=20_000)
    question: str | None = Field(default=None, min_length=1, max_length=500)

    @model_validator(mode="after")
    def has_one_answer(self) -> "GenerateResponse":
        """Require exactly one answer shape so the page never guesses.

        Example: a response with only `question` passes, while both fields fail validation.
        """
        if (self.code is None) == (self.question is None):
            raise ValueError("A reply must contain exactly one of code or question.")
        return self


class ProviderReply(BaseModel):
    """Stores only the final chat content and provider completion status.

    Example: `ProviderReply(content="buy when close > 1\\nsell when close < 1")` excludes reasoning.
    """

    content: str
    finish_reason: str | None = None


class AssistantProviderError(Exception):
    """Marks provider or configuration failures that should become a friendly 503.

    Example: a missing key raises this without exposing the key value.
    """

    def __init__(
        self,
        message: str,
        *,
        reason: str = "provider_failure",
        status_code: int | None = None,
        provider_code: str | None = None,
        provider_message: str | None = None,
        option: str | None = None,
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.status_code = status_code
        self.provider_code = provider_code
        self.provider_message = provider_message
        self.option = option


FAILURE_MESSAGES = {
    "key_missing": "Groq API key is missing. Set GROQ_API_KEY in api/.env and restart the API.",
    "key_rejected": "Groq rejected the API key. Check GROQ_API_KEY in api/.env.",
    "model_unavailable": "The Groq model name was not found or is not allowed for this account. Check GROQ_MODEL and model access.",
    "unsupported_option": "Groq rejected a request option. Check the API terminal for the unsupported option.",
    "rate_limit": "Groq is rate limiting requests. Wait a little and try again.",
    "network_failure": "Network blocked: the API could not reach Groq.",
    "timeout": "Groq did not respond before the request timed out. Try again shortly.",
    "empty_reply": "Groq returned an empty reply. Please try again.",
    "provider_failure": "Groq is temporarily unavailable. Please try again shortly.",
}


def classify_groq_error(status: int, code: str | None, message: str | None) -> tuple[str, str | None]:
    """Maps a Groq HTTP error to a stable category and optional rejected option.

    Example: a 401 response maps to `key_rejected` without returning provider details to the page.
    """
    folded_code = (code or "").casefold()
    folded_message = (message or "").casefold()
    combined = f"{folded_code} {folded_message}"
    if status == 401 or any(term in combined for term in ("invalid_api_key", "authentication_error", "invalid api key")):
        return "key_rejected", None
    if status == 404 or "model_not_found" in combined or ("model" in combined and any(x in combined for x in ("not found", "not allowed", "permission", "access", "unknown", "decommissioned", "unavailable"))):
        return "model_unavailable", None
    if status == 403:
        return ("model_unavailable", None) if "model" in combined else ("key_rejected", None)
    if status == 429:
        return "rate_limit", None
    if status == 400 and any(term in combined for term in ("unsupported", "unknown parameter", "unrecognized", "not supported", "invalid parameter", "not allowed")):
        option = next((name for name in ("reasoning_effort", "include_reasoning", "reasoning_format", "max_completion_tokens", "temperature") if name in combined), None)
        return "unsupported_option", option
    return "provider_failure", None


def _provider_error(response: httpx.Response, api_key: str) -> AssistantProviderError:
    """Extracts safe diagnostic fields from an error response and redacts the configured key.

    Example: Groq's `{error: {code, message}}` response supplies logs and diagnostic labels.
    """
    try:
        payload = response.json()
        error = payload.get("error", {}) if isinstance(payload, dict) else {}
        code = error.get("code") if isinstance(error, dict) else None
        message = error.get("message") if isinstance(error, dict) else None
    except (ValueError, TypeError):
        code, message = None, None
    code = str(code)[:160] if code is not None else None
    message = str(message).replace(api_key, "[redacted]")[:1000] if message is not None else None
    reason, option = classify_groq_error(response.status_code, code, message)
    return AssistantProviderError(
        FAILURE_MESSAGES[reason], reason=reason, status_code=response.status_code,
        provider_code=code, provider_message=message, option=option,
    )


class ChatProvider(Protocol):
    """Defines the fakeable final-answer interface used by the endpoint.

    Example: tests can provide an object whose `complete()` returns a fixed final message.
    """

    async def complete(self, request: GenerateRequest) -> ProviderReply: ...


class GroqChatProvider:
    """Calls Groq's OpenAI-compatible chat endpoint without a provider SDK.

    Example: `GroqChatProvider("secret", "openai/gpt-oss-120b", client).complete(request)` returns final content.
    """

    def __init__(self, api_key: str, model: str, client: httpx.AsyncClient) -> None:
        self._api_key = api_key
        self._model = model
        self._client = client

    async def complete(self, request: GenerateRequest) -> ProviderReply:
        """Sends spec-grounded instructions and accepts only the final answer field.

        Example: a completed call returns source text or one concise clarification question.
        """
        if not self._api_key.strip() or not self._model.strip():
            raise AssistantProviderError(
                FAILURE_MESSAGES["key_missing"], reason="key_missing"
            )
        try:
            prompt = build_system_prompt()
            user_message = build_user_message(request)
            response = await self._client.post(
                GROQ_CHAT_COMPLETIONS_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": self._model,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "reasoning_effort": "low",
                    # Groq documents both fields for GPT-OSS. On a provider 400 that
                    # identifies either as unsupported, retry once without both fields.
                    "include_reasoning": False,
                    "max_completion_tokens": 2_048,
                    "temperature": 0.2,
                },
            )
        except httpx.TimeoutException as error:
            raise AssistantProviderError(FAILURE_MESSAGES["timeout"], reason="timeout") from error
        except httpx.RequestError as error:
            raise AssistantProviderError(FAILURE_MESSAGES["network_failure"], reason="network_failure") from error
        if response.status_code == 400:
            provider_error = _provider_error(response, self._api_key)
            if provider_error.reason == "unsupported_option" and provider_error.option in {"reasoning_effort", "include_reasoning", "reasoning_format"}:
                logging.getLogger("algotrace.ai").warning(
                    "Groq rejected reasoning option; retrying with minimal request: status=%s code=%s option=%s",
                    provider_error.status_code,
                    provider_error.provider_code,
                    provider_error.option,
                )
                fallback_body = {
                    "model": self._model,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": user_message},
                    ],
                }
                try:
                    response = await self._client.post(
                        GROQ_CHAT_COMPLETIONS_URL,
                        headers={"Authorization": f"Bearer {self._api_key}"},
                        json=fallback_body,
                    )
                except httpx.TimeoutException as error:
                    raise AssistantProviderError(FAILURE_MESSAGES["timeout"], reason="timeout") from error
                except httpx.RequestError as error:
                    raise AssistantProviderError(FAILURE_MESSAGES["network_failure"], reason="network_failure") from error
            else:
                raise provider_error
        if response.is_error:
            raise _provider_error(response, self._api_key)
        try:
            payload = response.json()
            choice = payload["choices"][0]
            message = choice["message"]
            content = message.get("content")
            finish_reason = choice.get("finish_reason")
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise AssistantProviderError("The AI provider returned an unreadable reply.") from error
        if not isinstance(content, str) or not content.strip():
            raise AssistantProviderError(FAILURE_MESSAGES["empty_reply"], reason="empty_reply")
        if finish_reason == "length":
            raise AssistantProviderError("The AI reply was cut short. Please try a shorter request.")
        return ProviderReply(content=content.strip(), finish_reason=finish_reason if isinstance(finish_reason, str) else None)


async def get_chat_provider() -> AsyncIterator[ChatProvider]:
    """Supplies a configured provider for one request and closes its HTTP connection pool.

    Example: FastAPI yields a fake provider in tests or a 20-second Groq client locally.
    """
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    model = os.getenv("GROQ_MODEL", "").strip()
    if not api_key or not model:
        import logging

        reason = "key_missing" if not api_key else "model_unavailable"
        message = (
            FAILURE_MESSAGES["key_missing"]
            if not api_key
            else "GROQ_MODEL is missing. Set the model name in api/.env and restart the API."
        )
        logging.getLogger("algotrace.ai").warning("Groq request failed: reason=%s", reason)
        raise HTTPException(
            status_code=503,
            detail=message,
        )
    timeout = httpx.Timeout(20.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        yield GroqChatProvider(api_key, model, client)


def build_system_prompt() -> str:
    """Loads the exact strategy grammar and checked-in examples for the model.

    Example: reading the source spec here keeps system rules aligned with `/spec/strategy-language.md`.
    """
    try:
        specification = STRATEGY_SPEC.read_text(encoding="utf-8")
        reference_examples = {
            name: (EXAMPLE_DIR / f"{name}.strategy").read_text(encoding="utf-8")
            for name in ("sma_crossover", "rsi_oversold_overbought", "price_above_sma_stop")
        }
    except OSError as error:
        raise AssistantProviderError("The strategy-language instructions are unavailable.") from error
    examples = "\n\n".join(f"{name}:\n{source.rstrip()}" for name, source in reference_examples.items())
    return (
        "You write AlgoTrace strategy-language v1 programs. Use the exact language specification below; "
        "do not invent operators, functions, parameters, or syntax. All keywords and function names are lowercase. "
        "The only comparisons are > and <. Periods must be integer literals within the ranges in the specification. "
        "Each program has exactly one buy rule and one sell rule. Names must be assigned once before use. "
        "Use only the allowed functions and node inputs. If a request is ambiguous or impossible to express, ask "
        "one short clarifying question instead of guessing. If prior code and compiler messages are supplied, fix "
        "that program and return its whole corrected source. Output only complete strategy code or one question; "
        "never include markdown, explanations, or reasoning.\n\n"
        "Exact language specification (loaded from the repository):\n"
        f"<strategy-language-spec>\n{specification.rstrip()}\n</strategy-language-spec>\n\n"
        "Three checked-in reference examples:\n"
        f"{examples}\n\n"
        "Additional example using named values and both boolean operators:\n"
        "average = sma(close, 20)\nvolume_average = sma(volume, 20)\n"
        "strong = close > average\nactive_volume = volume > volume_average\n"
        "buy when strong and active_volume\n"
        "sell when close < average or close < open"
    )


def build_user_message(request: GenerateRequest) -> str:
    """Formats a first request or a complete compiler repair attempt.

    Example: a repair message includes both the last source and line-numbered feedback.
    """
    if request.previous_code is None and request.errors is None:
        return f"Write a strategy for this request:\n{request.text.strip()}"
    errors = request.errors or []
    listed_errors = "\n".join(f"- {message}" for message in errors) or "- The compiler did not accept this source."
    return (
        f"Original request:\n{request.text.strip()}\n\n"
        f"Previous complete program:\n{request.previous_code or '(empty)'}\n\n"
        f"Compiler messages:\n{listed_errors}\n\n"
        "Fix the program and return the entire corrected program, not a patch."
    )


def parse_provider_answer(reply: ProviderReply) -> GenerateResponse:
    """Converts only final content to the API's code-or-question result.

    Example: a fenced `strategy` block is returned as plain code without its fence lines.
    """
    content = reply.content.strip()
    if reply.finish_reason == "length":
        raise AssistantProviderError("The AI reply was cut short. Please try a shorter request.")
    if not content:
        raise AssistantProviderError(FAILURE_MESSAGES["empty_reply"], reason="empty_reply")
    if content.startswith("```"):
        content = re.sub(r"^```(?:[A-Za-z0-9_-]+)?\s*\r?\n", "", content, count=1)
        content = re.sub(r"\r?\n```\s*$", "", content, count=1).strip()
    if not content:
        raise AssistantProviderError(FAILURE_MESSAGES["empty_reply"], reason="empty_reply")
    if "\n" not in content and content.endswith("?"):
        return GenerateResponse(question=content)
    if content.startswith("{") or content.startswith("["):
        raise AssistantProviderError("The AI provider returned an unexpected reply format.")
    try:
        return GenerateResponse(code=content)
    except ValueError as error:
        raise AssistantProviderError("The AI provider returned an invalid reply.") from error
