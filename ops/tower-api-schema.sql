-- Tower of Babel — paid API (Phase 2) D1 schema.
--
-- Applied ONCE at activation time against the D1 database that is bound
-- to the Pages project as TOWER_DB (Cloudflare dashboard -> Workers &
-- Pages -> antarctic-labs -> Settings -> Bindings -> D1). Until that
-- binding exists every /api/v1, /api/keys and /api/stripe-webhook route
-- answers 503 (dormant by design) and /api/subscribe refuses to take
-- money (API_LIVE gate).
--
-- Keys are stored ONLY as SHA-256 hashes. The plaintext key exists once,
-- in the email that delivers it; it is never stored and never returned
-- by any endpoint.

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash TEXT PRIMARY KEY,
  prefix TEXT,
  last4 TEXT,
  email TEXT,
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'free',
  daily_limit INTEGER,
  revoked INTEGER DEFAULT 0,
  past_due INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_email ON api_keys (email);
CREATE INDEX IF NOT EXISTS idx_api_keys_customer ON api_keys (stripe_customer_id);

CREATE TABLE IF NOT EXISTS usage_daily (
  key_hash TEXT,
  day TEXT,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (key_hash, day)
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id TEXT PRIMARY KEY,
  processed_at TEXT
);
