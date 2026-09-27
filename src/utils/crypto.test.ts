import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { encryptValue, decryptValue, isEncrypted } from "./crypto";

describe("crypto", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("encrypts through the Rust encrypt_secret command", async () => {
    invokeMock.mockResolvedValue("AAAAAAAAAAAAAAAA:ciphertext");
    await expect(encryptValue("my-secret")).resolves.toBe("AAAAAAAAAAAAAAAA:ciphertext");
    expect(invokeMock).toHaveBeenCalledWith("encrypt_secret", { plaintext: "my-secret" });
  });

  it("decrypts through the Rust decrypt_secret command", async () => {
    invokeMock.mockResolvedValue("my-secret");
    await expect(decryptValue("AAAAAAAAAAAAAAAA:ciphertext")).resolves.toBe("my-secret");
    expect(invokeMock).toHaveBeenCalledWith("decrypt_secret", { encrypted: "AAAAAAAAAAAAAAAA:ciphertext" });
  });

  it("passes Rust errors through", async () => {
    invokeMock.mockRejectedValue("Invalid encrypted value format");
    await expect(decryptValue("not-valid")).rejects.toBe("Invalid encrypted value format");
  });

  it("isEncrypted recognizes the iv:ciphertext format", () => {
    // 12-byte IV -> 16 base64 chars
    expect(isEncrypted("AAECAwQFBgcICQoL:c2VjcmV0LWNpcGhlcnRleHQ=")).toBe(true);
  });

  it("isEncrypted returns false for plaintext", () => {
    expect(isEncrypted("sk-or-1234567890abcdef")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted("just-a-regular-string")).toBe(false);
    expect(isEncrypted("a:b:c")).toBe(false);
  });
});
