/**
 * Saves the "Add IMAP/SMTP account" wizard's progress so a failed connection
 * test, closing the dialog, or quitting the app doesn't lose what was typed.
 *
 * The whole draft (including passwords and OAuth tokens) is stored as one
 * encrypted setting and deleted once the account is added.
 */

import { deleteSetting, getSecureSetting, setSecureSetting } from "@/services/db/settings";

const DRAFT_KEY = "imap_account_draft";
const DRAFT_VERSION = 1;

interface StoredDraft<T> {
  version: number;
  savedAt: number;
  data: T;
}

export async function loadAccountDraft<T>(): Promise<T | null> {
  try {
    const raw = await getSecureSetting(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (parsed?.version !== DRAFT_VERSION || !parsed.data) return null;
    return parsed.data;
  } catch {
    // Unreadable (e.g. encrypted with a different key); start fresh.
    await clearAccountDraft();
    return null;
  }
}

export async function saveAccountDraft<T>(data: T): Promise<void> {
  const stored: StoredDraft<T> = { version: DRAFT_VERSION, savedAt: Date.now(), data };
  await setSecureSetting(DRAFT_KEY, JSON.stringify(stored));
}

export async function clearAccountDraft(): Promise<void> {
  try {
    await deleteSetting(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}
