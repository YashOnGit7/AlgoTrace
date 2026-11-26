/** Purpose: tests the retry and question behavior without calling FastAPI or Groq. Connects: mocked fetch responses to compiler repair requests. */
import { describe, expect, it, vi } from "vitest";
import { generateAndCheck } from "./assistantClient.js";

/** Builds a standards-shaped mock JSON response. @example `jsonResponse({code:"..."})` models an HTTP 200 answer. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("assistant code repair loop", () => {
  it("accepts the API success shape with code and a null question", async () => {
    const code = "strategy \"Demo\"\nbuy when close > 1\nsell when close < 1";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code, question: null }));
    const onCode = vi.fn();

    await expect(generateAndCheck({ text: "Write a rule", previousCode: "", endpoint: "/api/generate", fetcher, compile: () => ({ ok: true }), onCode }))
      .resolves.toEqual({ kind: "valid", code });
    expect(onCode).toHaveBeenCalledWith(code);
  });

  it("accepts the API question shape with null code", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code: null, question: "Which average period should I use?" }));

    await expect(generateAndCheck({ text: "Write a rule", previousCode: "keep me", endpoint: "/api/generate", fetcher, compile: () => ({ ok: true }), onCode: () => undefined }))
      .resolves.toEqual({ kind: "question", question: "Which average period should I use?" });
  });

  it("reports the final compiler error after two repair attempts", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: "bad source 1", question: null }))
      .mockResolvedValueOnce(jsonResponse({ code: "bad source 2", question: null }))
      .mockResolvedValueOnce(jsonResponse({ code: "bad source 3", question: null }));
    const compile = vi.fn(() => ({ ok: false as const, errors: [{ line: 4, column: 7, message: "Expected a buy rule." }] }));

    await expect(generateAndCheck({ text: "Write a rule", previousCode: "", endpoint: "/api/generate", fetcher, compile, onCode: () => undefined }))
      .resolves.toEqual({ kind: "invalid", code: "bad source 3", errors: [{ line: 4, column: 7, message: "Expected a buy rule." }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects a successful HTTP response with neither code nor question", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code: null, question: null }));

    await expect(generateAndCheck({ text: "Write a rule", previousCode: "", endpoint: "/api/generate", fetcher, compile: () => ({ ok: true }), onCode: () => undefined }))
      .rejects.toThrow("The reply could not be read.");
  });

  it("sends the previous code and line messages on its first repair request", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: "bad first source" }))
      .mockResolvedValueOnce(jsonResponse({ code: "valid repaired source" }));
    const compile = vi.fn((code: string) => code.startsWith("valid")
      ? { ok: true as const }
      : { ok: false as const, errors: [{ line: 4, column: 9, message: "Name 'fastt' is used before it is assigned." }] });
    const onCode = vi.fn();

    const result = await generateAndCheck({ text: "Buy on a moving average cross", previousCode: "my original code", endpoint: "/api/generate", fetcher, compile, onCode });

    expect(result).toEqual({ kind: "valid", code: "valid repaired source" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      text: "Buy on a moving average cross",
      previous_code: "bad first source",
      errors: ["Line 4, column 9: Name 'fastt' is used before it is assigned."],
    });
    expect(onCode.mock.calls.map(([code]) => code)).toEqual(["bad first source", "valid repaired source"]);
  });

  it("stops after two repair attempts when every generated program is invalid", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: "bad source 0" }))
      .mockResolvedValueOnce(jsonResponse({ code: "bad source 1" }))
      .mockResolvedValueOnce(jsonResponse({ code: "bad source 2" }));
    const compile = vi.fn(() => ({ ok: false as const, errors: [{ line: 2, message: "Expected a rule." }] }));

    const result = await generateAndCheck({ text: "Write a rule", previousCode: "old", endpoint: "/api/generate", fetcher, compile, onCode: () => undefined });

    expect(result).toMatchObject({ kind: "invalid", code: "bad source 2" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(compile).toHaveBeenCalledTimes(3);
  });

  it("keeps the existing source unchanged when the assistant asks a question", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ question: "What should count as cheap?" }));
    const onCode = vi.fn();
    const result = await generateAndCheck({ text: "Buy when cheap", previousCode: "keep this source", endpoint: "/api/generate", fetcher, compile: () => ({ ok: true }), onCode });

    expect(result).toEqual({ kind: "question", question: "What should count as cheap?" });
    expect(onCode).not.toHaveBeenCalled();
  });
});
