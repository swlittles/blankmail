use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub security: String,    // "tls", "starttls", "none"
    pub username: String,
    pub password: String,    // plaintext password or OAuth2 access token
    pub auth_method: String, // "password" or "oauth2"
    #[serde(default)]
    pub accept_invalid_certs: bool,
}

// Hand-written so the password/token never ends up in logs.
impl std::fmt::Debug for SmtpConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SmtpConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("security", &self.security)
            .field("username", &self.username)
            .field("password", &"<redacted>")
            .field("auth_method", &self.auth_method)
            .field("accept_invalid_certs", &self.accept_invalid_certs)
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmtpSendResult {
    pub success: bool,
    pub message: String,
}
