import { getSetting, getSecureSetting } from "@/services/db/settings";
import { AiError } from "./errors";
import type { AiProviderClient } from "./types";
import { DEFAULT_MODEL, OPENROUTER_API_KEY_SETTING, OPENROUTER_MODEL_SETTING } from "./types";
import { createOpenRouterProvider } from "./providers/openRouterProvider";

let cachedProvider: { key: string; client: AiProviderClient } | null = null;

export async function getActiveModel(): Promise<string> {
  return (await getSetting(OPENROUTER_MODEL_SETTING))?.trim() || DEFAULT_MODEL;
}

export async function getActiveProvider(): Promise<AiProviderClient> {
  const apiKey = await getSecureSetting(OPENROUTER_API_KEY_SETTING);

  if (!apiKey) {
    throw new AiError("NOT_CONFIGURED", "OpenRouter API key not configured");
  }

  const model = await getActiveModel();
  const cacheKey = `${apiKey}|${model}`;

  if (cachedProvider && cachedProvider.key === cacheKey) {
    return cachedProvider.client;
  }

  const client = createOpenRouterProvider(apiKey, model);
  cachedProvider = { key: cacheKey, client };
  return client;
}

export async function isAiAvailable(): Promise<boolean> {
  try {
    const enabled = await getSetting("ai_enabled");
    if (enabled === "false") return false;
    const key = await getSecureSetting(OPENROUTER_API_KEY_SETTING);
    return !!key;
  } catch {
    return false;
  }
}

export function clearProviderClients(): void {
  cachedProvider = null;
}
