/**
 * Look up IMAP/SMTP settings for domains that aren't in the well-known list,
 * using the Mozilla autoconfig format (the same lookups Thunderbird does):
 *
 * 1. https://autoconfig.<domain>/mail/config-v1.1.xml   (published by the domain)
 * 2. https://<domain>/.well-known/autoconfig/mail/config-v1.1.xml
 * 3. https://autoconfig.thunderbird.net/v1.1/<domain>    (Thunderbird's ISP database)
 *
 * Only the domain is sent; the email address is filled into the returned
 * templates locally.
 */

import { fetch } from "@tauri-apps/plugin-http";
import type { SecurityType, ServerSettings } from "./autoDiscovery";

export interface AutoconfigResult {
  settings: ServerSettings;
  /** Login username, when the provider's template differs from the full email address. */
  username?: string;
  /** Which lookup produced the result, for display. */
  source: string;
}

const REQUEST_TIMEOUT_MS = 6000;

export function autoconfigUrls(domain: string): string[] {
  const d = encodeURIComponent(domain.toLowerCase());
  return [
    `https://autoconfig.${d}/mail/config-v1.1.xml`,
    `https://${d}/.well-known/autoconfig/mail/config-v1.1.xml`,
    `https://autoconfig.thunderbird.net/v1.1/${d}`,
  ];
}

function mapSocketType(socketType: string | null | undefined): SecurityType | null {
  switch (socketType?.trim().toUpperCase()) {
    case "SSL":
      return "ssl";
    case "STARTTLS":
      return "starttls";
    case "PLAIN":
      return "none";
    default:
      return null;
  }
}

function fillTemplate(value: string, email: string): string {
  const at = email.lastIndexOf("@");
  const local = at >= 0 ? email.slice(0, at) : email;
  const domain = at >= 0 ? email.slice(at + 1) : "";
  return value
    .replace(/%EMAILADDRESS%/g, email)
    .replace(/%EMAILLOCALPART%/g, local)
    .replace(/%EMAILDOMAIN%/g, domain);
}

interface ParsedServer {
  host: string;
  port: number;
  security: SecurityType;
  username: string | null;
}

/** Pick the first server of `type`, preferring encrypted ones (providers list preferred first). */
function pickServer(doc: Document, tag: "incomingServer" | "outgoingServer", type: string): ParsedServer | null {
  const servers: ParsedServer[] = [];
  for (const el of Array.from(doc.getElementsByTagName(tag))) {
    if (el.getAttribute("type") !== type) continue;
    const host = el.getElementsByTagName("hostname")[0]?.textContent?.trim();
    const port = Number(el.getElementsByTagName("port")[0]?.textContent?.trim());
    const security = mapSocketType(el.getElementsByTagName("socketType")[0]?.textContent);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535 || !security) continue;
    servers.push({
      host,
      port,
      security,
      username: el.getElementsByTagName("username")[0]?.textContent?.trim() || null,
    });
  }
  return servers.find((s) => s.security !== "none") ?? servers[0] ?? null;
}

/** Parse a config-v1.1.xml document into server settings for `email`. */
export function parseAutoconfigXml(
  xml: string,
  email: string,
): { settings: ServerSettings; username?: string } | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const imap = pickServer(doc, "incomingServer", "imap");
  const smtp = pickServer(doc, "outgoingServer", "smtp");
  if (!imap || !smtp) return null;

  const settings: ServerSettings = {
    imapHost: fillTemplate(imap.host, email),
    imapPort: imap.port,
    imapSecurity: imap.security,
    smtpHost: fillTemplate(smtp.host, email),
    smtpPort: smtp.port,
    smtpSecurity: smtp.security,
  };

  const username = imap.username ? fillTemplate(imap.username, email) : undefined;
  return {
    settings,
    username: username && username.toLowerCase() !== email.toLowerCase() ? username : undefined,
  };
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal, connectTimeout: REQUEST_TIMEOUT_MS });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Try each autoconfig source in order and return the first usable result. */
export async function lookupAutoconfig(email: string): Promise<AutoconfigResult | null> {
  const at = email.lastIndexOf("@");
  const domain = at >= 0 ? email.slice(at + 1).trim() : "";
  if (!domain || !domain.includes(".")) return null;

  for (const url of autoconfigUrls(domain)) {
    const xml = await fetchText(url);
    if (!xml) continue;
    const parsed = parseAutoconfigXml(xml, email.trim());
    if (parsed) return { ...parsed, source: new URL(url).hostname };
  }
  return null;
}
