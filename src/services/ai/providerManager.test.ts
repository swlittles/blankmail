import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/settings", () => {
  const fn = vi.fn();
  return {
    getSetting: fn,
    getSecureSetting: fn,
  };
});

import { createMockAiProvider } from "@/test/mocks";

vi.mock("./providers/openRouterProvider", () => ({
  createOpenRouterProvider: vi.fn(() => createMockAiProvider("openrouter response")),
}));

import { getSetting } from "@/services/db/settings";
import { createOpenRouterProvider } from "./providers/openRouterProvider";
import {
  getActiveProvider,
  getActiveModel,
  isAiAvailable,
  clearProviderClients,
} from "./providerManager";

const mockGetSetting = vi.mocked(getSetting);

describe("providerManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviderClients();
  });

  describe("getActiveModel", () => {
    it("defaults when no model is set", async () => {
      mockGetSetting.mockResolvedValue(null);
      expect(await getActiveModel()).toBe("anthropic/claude-haiku-4.5");
    });

    it("defaults when the saved model is blank", async () => {
      mockGetSetting.mockResolvedValue("   ");
      expect(await getActiveModel()).toBe("anthropic/claude-haiku-4.5");
    });

    it("returns the saved model", async () => {
      mockGetSetting.mockResolvedValue("google/gemini-3.8-flash");
      expect(await getActiveModel()).toBe("google/gemini-3.8-flash");
    });
  });

  describe("getActiveProvider", () => {
    it("creates an OpenRouter provider with the default model", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "openrouter_api_key") return "sk-or-test";
        return null;
      });

      await getActiveProvider();
      expect(createOpenRouterProvider).toHaveBeenCalledWith("sk-or-test", "anthropic/claude-haiku-4.5");
    });

    it("uses the configured model", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "openrouter_api_key") return "sk-or-test";
        if (key === "openrouter_model") return "openai/gpt-5-mini";
        return null;
      });

      await getActiveProvider();
      expect(createOpenRouterProvider).toHaveBeenCalledWith("sk-or-test", "openai/gpt-5-mini");
    });

    it("throws NOT_CONFIGURED when no API key is set", async () => {
      mockGetSetting.mockResolvedValue(null);
      await expect(getActiveProvider()).rejects.toThrow("OpenRouter API key not configured");
    });

    it("caches the provider until key or model changes", async () => {
      let model = "openai/gpt-5-mini";
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "openrouter_api_key") return "sk-or-test";
        if (key === "openrouter_model") return model;
        return null;
      });

      await getActiveProvider();
      await getActiveProvider();
      expect(createOpenRouterProvider).toHaveBeenCalledTimes(1);

      model = "anthropic/claude-sonnet-5";
      await getActiveProvider();
      expect(createOpenRouterProvider).toHaveBeenCalledTimes(2);
    });

    it("recreates the provider after clearProviderClients", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "openrouter_api_key") return "sk-or-test";
        return null;
      });

      await getActiveProvider();
      clearProviderClients();
      await getActiveProvider();
      expect(createOpenRouterProvider).toHaveBeenCalledTimes(2);
    });
  });

  describe("isAiAvailable", () => {
    it("returns true when an API key exists", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "openrouter_api_key") return "sk-or-test";
        return null;
      });
      expect(await isAiAvailable()).toBe(true);
    });

    it("returns false when no API key exists", async () => {
      mockGetSetting.mockResolvedValue(null);
      expect(await isAiAvailable()).toBe(false);
    });

    it("returns false when AI is disabled", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "ai_enabled") return "false";
        if (key === "openrouter_api_key") return "sk-or-test";
        return null;
      });
      expect(await isAiAvailable()).toBe(false);
    });
  });
});
