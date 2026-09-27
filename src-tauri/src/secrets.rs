//! Encryption for stored credentials (IMAP passwords, OAuth tokens, API keys).
//!
//! Values are encrypted with AES-256-GCM. The key lives in the OS credential
//! store (macOS Keychain, Windows Credential Manager, Linux Secret Service) and
//! never leaves this process, so the webview only ever sees ciphertext and the
//! plaintext it asked for.
//!
//! The wire format matches what the frontend used to produce with Web Crypto:
//! `base64(iv) ":" base64(ciphertext || tag)`, with a 12-byte IV.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::sync::Mutex;
use tauri::Manager;

const KEYRING_SERVICE: &str = "com.swlittles.blankmail";
const KEYRING_ACCOUNT: &str = "credential-encryption-key";
/// Key file used by earlier builds; migrated into the keychain and deleted.
const LEGACY_KEY_FILE: &str = "blankmail.key";
const IV_LENGTH: usize = 12;

static CACHED_KEY: Mutex<Option<[u8; 32]>> = Mutex::new(None);

fn decode_key(b64: &str) -> Result<[u8; 32], String> {
    let bytes = STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("Stored encryption key is not valid base64: {e}"))?;
    bytes
        .try_into()
        .map_err(|_| "Stored encryption key has the wrong length".to_string())
}

fn load_or_create_key(app: &tauri::AppHandle) -> Result<[u8; 32], String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("Could not open the system keychain: {e}"))?;

    match entry.get_password() {
        Ok(b64) => return decode_key(&b64),
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("Could not read the encryption key from the keychain: {e}")),
    }

    let legacy_path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(LEGACY_KEY_FILE))
        .filter(|p| p.exists());

    let key_b64 = match &legacy_path {
        Some(path) => std::fs::read_to_string(path)
            .map_err(|e| format!("Could not read legacy key file: {e}"))?
            .trim()
            .to_string(),
        None => STANDARD.encode(Aes256Gcm::generate_key(OsRng)),
    };
    let key = decode_key(&key_b64)?;

    entry
        .set_password(&key_b64)
        .map_err(|e| format!("Could not save the encryption key to the keychain: {e}"))?;

    if let Some(path) = legacy_path {
        if let Err(e) = std::fs::remove_file(&path) {
            log::warn!("Migrated encryption key to keychain but could not delete {path:?}: {e}");
        }
    }

    Ok(key)
}

fn get_key(app: &tauri::AppHandle) -> Result<[u8; 32], String> {
    let mut cached = CACHED_KEY.lock().map_err(|_| "Key cache poisoned".to_string())?;
    if let Some(key) = *cached {
        return Ok(key);
    }
    let key = load_or_create_key(app)?;
    *cached = Some(key);
    Ok(key)
}

fn encrypt_with_key(key: &[u8; 32], plaintext: &str) -> Result<String, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| "Encryption failed".to_string())?;
    Ok(format!("{}:{}", STANDARD.encode(nonce), STANDARD.encode(ciphertext)))
}

fn decrypt_with_key(key: &[u8; 32], encrypted: &str) -> Result<String, String> {
    let (iv_b64, ct_b64) = encrypted
        .split_once(':')
        .filter(|(iv, ct)| !iv.is_empty() && !ct.is_empty() && !ct.contains(':'))
        .ok_or_else(|| "Invalid encrypted value format".to_string())?;
    let iv = STANDARD.decode(iv_b64).map_err(|_| "Invalid encrypted value format".to_string())?;
    let ciphertext = STANDARD.decode(ct_b64).map_err(|_| "Invalid encrypted value format".to_string())?;
    if iv.len() != IV_LENGTH {
        return Err("Invalid encrypted value format".to_string());
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&iv), ciphertext.as_ref())
        .map_err(|_| "Decryption failed".to_string())?;
    String::from_utf8(plaintext).map_err(|_| "Decrypted value is not valid UTF-8".to_string())
}

// Keychain access can block (and may show a system prompt), so run it off the
// async runtime's worker threads.
async fn with_key<T: Send + 'static>(
    app: tauri::AppHandle,
    f: impl FnOnce(&[u8; 32]) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || f(&get_key(&app)?))
        .await
        .map_err(|e| format!("Encryption task failed: {e}"))?
}

#[tauri::command]
pub async fn encrypt_secret(app: tauri::AppHandle, plaintext: String) -> Result<String, String> {
    with_key(app, move |key| encrypt_with_key(key, &plaintext)).await
}

#[tauri::command]
pub async fn decrypt_secret(app: tauri::AppHandle, encrypted: String) -> Result<String, String> {
    with_key(app, move |key| decrypt_with_key(key, &encrypted)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; 32] = [7u8; 32];

    #[test]
    fn round_trips() {
        let enc = encrypt_with_key(&KEY, "hunter2 🔐").unwrap();
        assert_eq!(decrypt_with_key(&KEY, &enc).unwrap(), "hunter2 🔐");
    }

    #[test]
    fn uses_fresh_iv_each_time() {
        assert_ne!(encrypt_with_key(&KEY, "x").unwrap(), encrypt_with_key(&KEY, "x").unwrap());
    }

    #[test]
    fn output_matches_web_crypto_format() {
        let enc = encrypt_with_key(&KEY, "abc").unwrap();
        let (iv, ct) = enc.split_once(':').unwrap();
        assert_eq!(iv.len(), 16); // 12 bytes base64
        // 3 bytes plaintext + 16 byte GCM tag
        assert_eq!(STANDARD.decode(ct).unwrap().len(), 19);
    }

    #[test]
    fn rejects_wrong_key_and_tampering() {
        let enc = encrypt_with_key(&KEY, "secret").unwrap();
        assert!(decrypt_with_key(&[8u8; 32], &enc).is_err());
        let (iv, ct) = enc.split_once(':').unwrap();
        let mut bytes = STANDARD.decode(ct).unwrap();
        bytes[0] ^= 1;
        assert!(decrypt_with_key(&KEY, &format!("{iv}:{}", STANDARD.encode(bytes))).is_err());
    }

    #[test]
    fn rejects_malformed_input() {
        for bad in ["", "abc", ":", "a:", ":b", "a:b:c", "!!!:???", "AAAA:AAAA"] {
            assert!(decrypt_with_key(&KEY, bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn decode_key_validates_length() {
        assert!(decode_key(&STANDARD.encode([1u8; 32])).is_ok());
        assert!(decode_key(&STANDARD.encode([1u8; 16])).is_err());
    }

    /// Touches the real OS keychain, so it's opt-in: `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn keychain_round_trip() {
        let entry = keyring::Entry::new(KEYRING_SERVICE, "test-only-key").unwrap();
        let key_b64 = STANDARD.encode([9u8; 32]);
        entry.set_password(&key_b64).unwrap();
        let loaded = decode_key(&entry.get_password().unwrap()).unwrap();
        entry.delete_credential().unwrap();
        assert_eq!(loaded, [9u8; 32]);
        assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
    }
}
