import { AiError } from "../errors";
import type { AiProviderClient, AiCompletionRequest } from "../types";
import { OPENROUTER_BASE_URL } from "../types";

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

async function chat(
  apiKey: string,
  model: string,
  messages: { role: "system" | "user"; content: string }[],
  maxTokens: number,
): Promise<string> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/swlittles/blankmail",
      "X-Title": "BlankMail",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });

  const body = (await response.json().catch(() => ({}))) as ChatResponse;

  if (!response.ok) {
    const detail = body.error?.message ?? response.statusText;
    if (response.status === 401 || response.status === 403) {
      throw new AiError("AUTH_ERROR", "Invalid OpenRouter API key");
    }
    if (response.status === 429) {
      throw new AiError("RATE_LIMITED", "Rate limited — please try again shortly");
    }
    throw new AiError("NETWORK_ERROR", `OpenRouter error ${response.status}: ${detail}`);
  }

  return body.choices?.[0]?.message?.content ?? "";
}

export function createOpenRouterProvider(apiKey: string, model: string): AiProviderClient {
  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      return chat(
        apiKey,
        model,
        [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userContent },
        ],
        req.maxTokens ?? 1024,
      );
    },

    async testConnection(): Promise<boolean> {
      try {
        await chat(apiKey, model, [{ role: "user", content: "Say hi" }], 10);
        return true;
      } catch {
        return false;
      }
    },
  };
}
