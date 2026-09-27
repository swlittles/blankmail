export interface AiCompletionRequest {
  systemPrompt: string;
  userContent: string;
  maxTokens?: number;
}

export interface AiProviderClient {
  complete(req: AiCompletionRequest): Promise<string>;
  testConnection(): Promise<boolean>;
}

/** All AI requests go through OpenRouter, which routes to the chosen model. */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const OPENROUTER_API_KEY_SETTING = "openrouter_api_key";
export const OPENROUTER_MODEL_SETTING = "openrouter_model";

export const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

export interface ModelOption {
  id: string;
  label: string;
}

/** Suggested OpenRouter model IDs. Any other OpenRouter model ID can be entered in Settings. */
export const SUGGESTED_MODELS: ModelOption[] = [
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { id: "openrouter/auto", label: "Auto (OpenRouter picks)" },
];
