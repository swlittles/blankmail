import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock("@/services/db/settings", () => ({
  getSecureSetting: vi.fn(async (k: string) => store.get(k) ?? null),
  setSecureSetting: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  deleteSetting: vi.fn(async (k: string) => void store.delete(k)),
}));

import { setSecureSetting } from "@/services/db/settings";
import { clearAccountDraft, loadAccountDraft, saveAccountDraft } from "./accountDraft";

describe("accountDraft", () => {
  beforeEach(() => store.clear());

  it("round-trips a draft through the encrypted settings store", async () => {
    await saveAccountDraft({ step: "smtp", form: { email: "a@b.com", password: "pw" } });
    expect(setSecureSetting).toHaveBeenCalledWith("imap_account_draft", expect.any(String));
    expect(await loadAccountDraft()).toEqual({ step: "smtp", form: { email: "a@b.com", password: "pw" } });
  });

  it("returns null when there is no draft or it was cleared", async () => {
    expect(await loadAccountDraft()).toBeNull();
    await saveAccountDraft({ step: "basic" });
    await clearAccountDraft();
    expect(await loadAccountDraft()).toBeNull();
  });

  it("discards unreadable drafts", async () => {
    store.set("imap_account_draft", "not json");
    expect(await loadAccountDraft()).toBeNull();
    expect(store.has("imap_account_draft")).toBe(false);
  });
});
