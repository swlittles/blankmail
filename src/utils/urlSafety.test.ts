import { describe, it, expect } from "vitest";
import { isPublicHttpsUrl } from "./urlSafety";

describe("isPublicHttpsUrl", () => {
  it("allows public https URLs", () => {
    expect(isPublicHttpsUrl("https://list.example.com/unsub?id=1")).toBe(true);
    expect(isPublicHttpsUrl("https://8.8.8.8/unsub")).toBe(true);
    expect(isPublicHttpsUrl("https://172.32.0.1/x")).toBe(true);
  });

  it("rejects non-https and credentials", () => {
    expect(isPublicHttpsUrl("http://list.example.com/unsub")).toBe(false);
    expect(isPublicHttpsUrl("ftp://list.example.com/unsub")).toBe(false);
    expect(isPublicHttpsUrl("https://user:pw@list.example.com/")).toBe(false);
    expect(isPublicHttpsUrl("not a url")).toBe(false);
  });

  it("rejects local and private hosts", () => {
    for (const url of [
      "https://localhost/x",
      "https://localhost:8443/x",
      "https://app.localhost/x",
      "https://router/x",
      "https://printer.local/x",
      "https://nas.lan/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://172.16.0.1/x",
      "https://192.168.1.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://100.64.0.1/x",
      "https://0.0.0.0/x",
      "https://[::1]/x",
    ]) {
      expect(isPublicHttpsUrl(url), url).toBe(false);
    }
  });
});
