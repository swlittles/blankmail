/**
 * Encryption for stored credentials (IMAP passwords, OAuth tokens, API keys).
 *
 * The work happens in Rust (`src-tauri/src/secrets.rs`): values are encrypted
 * with AES-256-GCM using a key kept in the OS keychain, so the key never
 * touches disk or this webview.
 *
 * Format: base64(iv) ":" base64(ciphertext || tag)
 */

import { invoke } from "@tauri-apps/api/core";

/** Encrypt a plaintext string. */
export async function encryptValue(plaintext: string): Promise<string> {
  return invoke<string>("encrypt_secret", { plaintext });
}

/** Decrypt a value produced by encryptValue. */
export async function decryptValue(encrypted: string): Promise<string> {
  return invoke<string>("decrypt_secret", { encrypted });
}

/**
 * Check if a value looks like it's already encrypted (base64:base64 format).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 2) return false;
  try {
    atob(parts[0]!);
    atob(parts[1]!);
    // Encrypted values have a 12-byte IV (16 chars base64) and substantial ciphertext
    return parts[0]!.length === 16;
  } catch {
    return false;
  }
}
