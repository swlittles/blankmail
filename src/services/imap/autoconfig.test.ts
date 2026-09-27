import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));

import { autoconfigUrls, lookupAutoconfig, parseAutoconfigXml } from "./autoconfig";

// Trimmed copy of what MangoMail publishes at autoconfig.<domain>.
const MANGO_XML = `<?xml version="1.0"?>
<clientConfig version="1.1">
  <emailProvider id="smtp.mymangomail.com">
    <incomingServer type="imap">
      <hostname>imap.mymangomail.com</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
      <username>%EMAILADDRESS%</username>
      <authentication>password-cleartext</authentication>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.mymangomail.com</hostname>
      <port>465</port>
      <socketType>SSL</socketType>
      <username>%EMAILADDRESS%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;

function response(status: number, body: string): Response {
  return new Response(body, { status });
}

describe("parseAutoconfigXml", () => {
  it("reads IMAP and SMTP servers", () => {
    expect(parseAutoconfigXml(MANGO_XML, "me@example.tv")).toEqual({
      settings: {
        imapHost: "imap.mymangomail.com",
        imapPort: 993,
        imapSecurity: "ssl",
        smtpHost: "smtp.mymangomail.com",
        smtpPort: 465,
        smtpSecurity: "ssl",
      },
      username: undefined,
    });
  });

  it("prefers encrypted servers and fills templates", () => {
    const xml = `<clientConfig><emailProvider>
      <incomingServer type="pop3"><hostname>pop.x.com</hostname><port>995</port><socketType>SSL</socketType></incomingServer>
      <incomingServer type="imap"><hostname>plain.%EMAILDOMAIN%</hostname><port>143</port><socketType>plain</socketType></incomingServer>
      <incomingServer type="imap"><hostname>imap.%EMAILDOMAIN%</hostname><port>143</port><socketType>STARTTLS</socketType><username>%EMAILLOCALPART%</username></incomingServer>
      <outgoingServer type="smtp"><hostname>smtp.%EMAILDOMAIN%</hostname><port>587</port><socketType>STARTTLS</socketType></outgoingServer>
    </emailProvider></clientConfig>`;
    const result = parseAutoconfigXml(xml, "bob@corp.io");
    expect(result?.settings.imapHost).toBe("imap.corp.io");
    expect(result?.settings.imapSecurity).toBe("starttls");
    expect(result?.settings.smtpHost).toBe("smtp.corp.io");
    expect(result?.username).toBe("bob");
  });

  it("returns null for invalid or incomplete documents", () => {
    expect(parseAutoconfigXml("not xml <", "a@b.com")).toBeNull();
    expect(parseAutoconfigXml("<clientConfig><emailProvider></emailProvider></clientConfig>", "a@b.com")).toBeNull();
  });
});

describe("lookupAutoconfig", () => {
  beforeEach(() => fetchMock.mockReset());

  it("tries the domain's autoconfig host first and sends only the domain", async () => {
    fetchMock.mockResolvedValueOnce(response(200, MANGO_XML));
    const result = await lookupAutoconfig("stephen@example.tv");
    expect(result?.settings.smtpHost).toBe("smtp.mymangomail.com");
    expect(result?.source).toBe("autoconfig.example.tv");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://autoconfig.example.tv/mail/config-v1.1.xml");
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("stephen");
  });

  it("falls back to the Thunderbird ISP database", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("dns"))
      .mockResolvedValueOnce(response(404, ""))
      .mockResolvedValueOnce(response(200, MANGO_XML));
    const result = await lookupAutoconfig("a@example.com");
    expect(result?.source).toBe("autoconfig.thunderbird.net");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns null when nothing is found", async () => {
    fetchMock.mockResolvedValue(response(404, ""));
    expect(await lookupAutoconfig("a@example.com")).toBeNull();
    expect(await lookupAutoconfig("not-an-email")).toBeNull();
  });

  it("builds the three lookup URLs", () => {
    expect(autoconfigUrls("Example.COM")).toEqual([
      "https://autoconfig.example.com/mail/config-v1.1.xml",
      "https://example.com/.well-known/autoconfig/mail/config-v1.1.xml",
      "https://autoconfig.thunderbird.net/v1.1/example.com",
    ]);
  });
});
