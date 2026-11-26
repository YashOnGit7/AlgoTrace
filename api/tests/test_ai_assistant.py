"""Purpose: tests AI proxy behavior without a real provider call. Connects: API validation, rate limits, and fake chat replies."""

from collections.abc import AsyncIterator, Coroutine
import json
from typing import Any, TypeVar

import pytest
from fastapi import HTTPException
import httpx
from starlette.requests import Request

from app import main
from app.ai_assistant import (
    AssistantProviderError,
    GenerateRequest,
    GroqChatProvider,
    ProviderReply,
    build_system_prompt,
    classify_groq_error,
    FAILURE_MESSAGES,
    get_chat_provider,
)

T = TypeVar("T")


class FakeProvider:
    """Returns one chosen final chat answer and records the received request.

    Example: `FakeProvider("buy when close > 1\\nsell when close < 1")` simulates a valid answer.
    """

    def __init__(self, answer: str = "buy when close > 1\nsell when close < 1", error: Exception | None = None) -> None:
        """Select the fixed response or provider error for one test case.

        Example: pass `error=AssistantProviderError("offline")` to test friendly failure handling.
        """
        self.answer = answer
        self.error = error
        self.requests: list[GenerateRequest] = []

    async def complete(self, request: GenerateRequest) -> ProviderReply:
        """Records input and returns a fixed provider response for deterministic tests.

        Example: each call appends its repair context to `requests`.
        """
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        return ProviderReply(content=self.answer)


@pytest.fixture
def ai_client() -> AsyncIterator[FakeProvider]:
    """Installs a fake chat provider and clears per-client rate history per test.

    Example: tests get an isolated `TestClient` and fake provider with no network access.
    """
    fake = FakeProvider()

    async def provider_override() -> AsyncIterator[FakeProvider]:
        yield fake

    main.app.dependency_overrides[get_chat_provider] = provider_override
    main._AI_REQUESTS.clear()
    yield fake
    main.app.dependency_overrides.clear()
    main._AI_REQUESTS.clear()


def post_generate(payload: dict[str, object], fake: FakeProvider) -> tuple[int, dict[str, object]]:
    """Calls the async endpoint with validated input and a local fake provider.

    Example: the route's handler and response validation run without opening a socket.
    """
    request = Request({
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
        "scheme": "http", "path": "/api/generate", "raw_path": b"/api/generate", "query_string": b"",
        "headers": [], "client": ("test-client", 1234), "server": ("test-server", 8000),
    })

    async def call() -> tuple[int, dict[str, object]]:
        try:
            main.enforce_ai_rate_limit(request)
            response = await main.generate_strategy(GenerateRequest.model_validate(payload), fake)
        except HTTPException as error:
            return error.status_code, {"detail": error.detail}
        return 200, response.model_dump(exclude_none=True)

    return run_immediate_coroutine(call())


def run_immediate_coroutine(coroutine: Coroutine[Any, Any, T]) -> T:
    """Runs a fake-only async endpoint coroutine without creating a Windows socket loop.

    Example: the local fake provider completes synchronously, so the coroutine returns at its first step.
    """
    try:
        return coroutine.send(None)
    except StopIteration as complete:
        return complete.value


def test_generate_endpoint_returns_code_from_fake_provider(ai_client: FakeProvider) -> None:
    """Return the final source in the documented `{code}` shape.

    Example: a plain-English request receives the fake provider's complete program.
    """
    fake = ai_client
    status, payload = post_generate({"text": "Buy when close rises"}, fake)

    assert status == 200
    assert payload == {"code": "buy when close > 1\nsell when close < 1"}
    assert fake.requests[0].text == "Buy when close rises"


def test_generate_endpoint_returns_one_clarifying_question(ai_client: FakeProvider) -> None:
    """Keep a model question separate from strategy code.

    Example: an ambiguous “buy when cheap” request can return `{question: ...}`.
    """
    fake = ai_client
    fake.answer = "What should count as cheap?"

    status, payload = post_generate({"text": "Buy when it looks cheap"}, fake)

    assert status == 200
    assert payload == {"question": "What should count as cheap?"}


def test_generate_endpoint_strips_a_markdown_code_fence(ai_client: FakeProvider) -> None:
    """Return only source when a model wraps it in a fenced block.

    Example: an optional `strategy` fence is removed before the editor receives code.
    """
    fake = ai_client
    fake.answer = "```strategy\nbuy when close > 1\nsell when close < 1\n```"

    status, payload = post_generate({"text": "Write a simple rule"}, fake)

    assert status == 200
    assert payload == {"code": "buy when close > 1\nsell when close < 1"}


@pytest.mark.parametrize("answer", ["{not code}", "   "])
def test_generate_endpoint_turns_malformed_or_empty_reply_into_friendly_503(
    ai_client: FakeProvider, answer: str,
) -> None:
    """Do not expose empty or malformed model output as code.

    Example: invalid JSON-like output receives a simple retry message and HTTP 503.
    """
    fake = ai_client
    fake.answer = answer

    status, payload = post_generate({"text": "Write something"}, fake)

    assert status == 503
    assert "detail" in payload
    assert "key" not in str(payload).lower()


@pytest.mark.parametrize("missing_setting", ["GROQ_API_KEY", "GROQ_MODEL"])
def test_generate_endpoint_returns_503_when_either_required_setting_is_missing(
    monkeypatch: pytest.MonkeyPatch, missing_setting: str,
) -> None:
    """Fail without provider credentials and avoid attempting a real request.

    Example: an empty key or model produces setup guidance without contacting Groq.
    """
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-120b")
    monkeypatch.setenv(missing_setting, "")
    main.app.dependency_overrides.clear()
    main._AI_REQUESTS.clear()
    async def get_provider() -> None:
        await anext(get_chat_provider())

    try:
        run_immediate_coroutine(get_provider())
    except HTTPException as error:
        status, payload = error.status_code, {"detail": error.detail}
    else:
        raise AssertionError("missing AI settings were unexpectedly accepted")
    assert status == 503
    assert "api/.env" in payload["detail"]


def test_generate_endpoint_maps_provider_failure_to_friendly_503(ai_client: FakeProvider) -> None:
    """Hide upstream response details and return a stable message to the page.

    Example: provider authentication errors never return their response body to a browser.
    """
    fake = ai_client
    fake.error = AssistantProviderError(FAILURE_MESSAGES["provider_failure"], reason="provider_failure")

    status, payload = post_generate({"text": "Buy above an average"}, fake)

    assert status == 503
    assert payload == {"detail": FAILURE_MESSAGES["provider_failure"]}


@pytest.mark.parametrize(
    ("reason", "detail"),
    [
        ("key_missing", FAILURE_MESSAGES["key_missing"]),
        ("key_rejected", FAILURE_MESSAGES["key_rejected"]),
        ("model_unavailable", FAILURE_MESSAGES["model_unavailable"]),
        ("unsupported_option", FAILURE_MESSAGES["unsupported_option"]),
        ("rate_limit", FAILURE_MESSAGES["rate_limit"]),
        ("network_failure", FAILURE_MESSAGES["network_failure"]),
        ("timeout", FAILURE_MESSAGES["timeout"]),
        ("empty_reply", FAILURE_MESSAGES["empty_reply"]),
    ],
)
def test_generate_endpoint_returns_specific_safe_message_for_each_provider_failure(
    ai_client: FakeProvider, reason: str, detail: str, caplog: pytest.LogCaptureFixture,
) -> None:
    """Give a plain-language cause and log only safe diagnostic metadata.

    Example: a fake 401 classification becomes a key-rejected message without credentials.
    """
    fake = ai_client
    fake.error = AssistantProviderError(
        detail, reason=reason, status_code=401, provider_code="fake_error",
        provider_message="fake provider message", option="reasoning_effort",
    )

    status, payload = post_generate({"text": "Write a rule"}, fake)

    assert status == 503
    assert payload == {"detail": detail}
    assert f"reason={reason}" in caplog.text
    assert "fake provider message" in caplog.text
    assert "test-secret" not in caplog.text


@pytest.mark.parametrize(
    ("status", "code", "message", "expected", "option"),
    [
        (401, "invalid_api_key", "Invalid API key", "key_rejected", None),
        (404, "model_not_found", "Model was not found", "model_unavailable", None),
        (403, "model_permission_blocked_org", "Model blocked", "model_unavailable", None),
        (400, "unsupported_parameter", "include_reasoning is not supported", "unsupported_option", "include_reasoning"),
        (429, "rate_limit_exceeded", "Too many requests", "rate_limit", None),
        (500, "server_error", "Temporary failure", "provider_failure", None),
    ],
)
def test_groq_error_classifier(status: int, code: str, message: str, expected: str, option: str | None) -> None:
    """Classify provider status/code/message combinations without network access.

    Example: Groq's model-permission 403 maps separately from invalid credentials.
    """
    assert classify_groq_error(status, code, message) == (expected, option)


def test_groq_retries_without_reasoning_options_when_provider_rejects_them() -> None:
    """Retry once with only model/messages after a reported reasoning-option rejection.

    Example: a proxy rejecting `reasoning_effort` still gets the minimal chat request.
    """
    bodies: list[dict[str, object]] = []

    async def provider_response(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        if len(bodies) == 1:
            return httpx.Response(400, json={"error": {
                "code": "unsupported_parameter", "message": "reasoning_effort is not supported"
            }})
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {
            "content": "buy when close > 1\nsell when close < 1"
        }}]})

    async def call_provider() -> ProviderReply:
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider_response), timeout=20.0) as client:
            return await GroqChatProvider("test-secret", "openai/gpt-oss-120b", client).complete(
                GenerateRequest(text="Buy above one")
            )

    reply = run_immediate_coroutine(call_provider())
    assert reply.content.startswith("buy when")
    assert bodies[0]["reasoning_effort"] == "low"
    assert bodies[0]["include_reasoning"] is False
    assert set(bodies[1]) == {"model", "messages"}


def test_generate_endpoint_limits_each_client_to_twenty_calls_per_minute(
    ai_client: FakeProvider,
) -> None:
    """Stop a client after twenty calls during the rolling minute.

    Example: the 21st call receives HTTP 429 without reaching the provider.
    """
    fake = ai_client
    for _ in range(20):
        assert post_generate({"text": "Write a rule"}, fake)[0] == 200

    status, _ = post_generate({"text": "Write another rule"}, fake)

    assert status == 429
    assert len(fake.requests) == 20


def test_prompt_loads_the_current_spec_and_all_four_examples() -> None:
    """Keep model grammar and examples connected to checked-in strategy files.

    Example: the prompt contains current language rules and a named AND/OR example.
    """
    prompt = build_system_prompt()

    assert "Only `>` and `<` comparisons exist" in prompt
    assert "fast = sma(close, 10)" in prompt
    assert "value = rsi(close, 14)" in prompt
    assert "stop_loss 10%" in prompt
    assert "buy when strong and active_volume" in prompt
    assert "sell when close < average or close < open" in prompt


def test_groq_http_request_uses_configured_model_low_reasoning_and_final_content_only() -> None:
    """Send supported privacy settings and ignore any separate reasoning field.

    Example: a mock Groq response containing `reasoning` yields only its final `content`.
    """
    captured: dict[str, object] = {}

    async def provider_response(request: httpx.Request) -> httpx.Response:
        """Captures the direct HTTP payload and returns a fake final answer.

        Example: this mock receives `include_reasoning: false` without contacting Groq.
        """
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {
            "content": "buy when close > 1\nsell when close < 1", "reasoning": "DO NOT RETURN THIS TEXT",
        }}]})

    async def call_provider() -> ProviderReply:
        """Runs the provider through HTTPX's in-memory transport.

        Example: the returned reply includes content while ignoring its separate reasoning field.
        """
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider_response), timeout=20.0) as client:
            provider = GroqChatProvider("test-secret", "openai/gpt-oss-20b", client)
            return await provider.complete(GenerateRequest(text="Buy above one"))

    reply = run_immediate_coroutine(call_provider())
    body = captured["body"]

    assert reply.content == "buy when close > 1\nsell when close < 1"
    assert "DO NOT RETURN THIS TEXT" not in reply.content
    assert isinstance(body, dict)
    assert body["model"] == "openai/gpt-oss-20b"
    assert body["reasoning_effort"] == "low"
    assert body["include_reasoning"] is False
    assert captured["url"] == "https://api.groq.com/openai/v1/chat/completions"
