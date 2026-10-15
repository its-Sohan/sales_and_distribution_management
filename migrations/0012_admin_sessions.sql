-- Only hashes of opaque session tokens are stored. Shop records are unchanged.
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE auth_login_attempts (
  client_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
