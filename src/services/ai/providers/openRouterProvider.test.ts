import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createOpenRouterProvider } from "./openRouterProvider";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("openRouterProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the prompt to OpenRouter and returns the reply", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "Hello!" } }] }));

    const provider = createOpenRouterProvider("sk-or-test", "anthropic/claude-haiku-4.5");
    const result = await provider.complete({ systemPrompt: "sys", userContent: "hi", maxTokens: 50 });

    expect(result).toBe("Hello!");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-or-test");
    expect(JSON.parse(init.body)).toEqual({
      model: "anthropic/claude-haiku-4.5",
      max_tokens: 50,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
    });
  });

  it("maps 401 to AUTH_ERROR", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { message: "No auth" } }));
    const provider = createOpenRouterProvider("bad", "m");
    await expect(provider.complete({ systemPrompt: "s", userContent: "u" })).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });

  it("maps 429 to RATE_LIMITED", async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, {}));
    const provider = createOpenRouterProvider("k", "m");
    await expect(provider.complete({ systemPrompt: "s", userContent: "u" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("includes OpenRouter's error message for other failures", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: "bad model" } }));
    const provider = createOpenRouterProvider("k", "m");
    await expect(provider.complete({ systemPrompt: "s", userContent: "u" })).rejects.toThrow("OpenRouter error 400: bad model");
  });

  it("testConnection reports success and failure", async () => {
    const provider = createOpenRouterProvider("k", "m");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: "hi" } }] }));
    expect(await provider.testConnection()).toBe(true);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    expect(await provider.testConnection()).toBe(false);
  });
});
