// Tower of Babel — paid API (Phase 2) shared helpers.
//
// Key model (DPLA-style, no accounts): the API key IS the identity.
// Keys are generated with 256 bits of entropy, prefixed "twr_live_",
// and stored ONLY as a SHA-256 hash in D1 (binding: TOWER_DB). The
// plaintext is emailed to the owner exactly once at mint time; it is
// never stored and never returned by any endpoint. Losing a key means
// minting a new one, which revokes the old.
//
// Plans and daily request limits:
//   free       200/day   catalog search + metadata, non-commercial
//   pro        5000/day  + full text, single-project commercial use
//   commercial 25000/day + bulk snapshots, multi-project commercial use
//
// Every /api/v1 response carries X-RateLimit-Limit / -Remaining /
// -Reset headers once a key is authenticated. Limits are enforced from
// the D1 usage_daily counter: consumption is a single atomic upsert
// whose RETURNING count is the allow/deny decision (no check-then-act
// race), and a counter read/write failure denies the request (429/500)
// rather than letting it through uncounted.

export const PLAN_LIMITS = { free: 200, pro: 5000, commercial: 25000 };
export const KEY_PREFIX = "twr_live_";

const enc = new TextEncoder();

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64url = btoa(bin)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return KEY_PREFIX + b64url;
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

export function resetEpoch(d = new Date()) {
  const next = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  );
  return Math.floor(next.getTime() / 1000);
}

export function rateHeaders(stats) {
  if (!stats) return {};
  return {
    "X-RateLimit-Limit": String(stats.limit),
    "X-RateLimit-Remaining": String(Math.max(0, stats.remaining)),
    "X-RateLimit-Reset": String(stats.reset),
  };
}

// The key's daily limit (row value wins, plan table is the fallback).
export function keyLimit(keyRow) {
  return typeof keyRow.daily_limit === "number"
    ? keyRow.daily_limit
    : PLAN_LIMITS[keyRow.plan] || PLAN_LIMITS.free;
}

// Current usage for a key (no increment). Returns a stats object, or
// null when the counter cannot be read — callers must treat null as
// "unknown", never as zero.
export async function usageStats(env, keyRow) {
  const day = utcDay();
  let row;
  try {
    row = await env.TOWER_DB.prepare(
      "SELECT count FROM usage_daily WHERE key_hash = ? AND day = ?"
    )
      .bind(keyRow.key_hash, day)
      .first();
  } catch (err) {
    console.error("usageStats read failed", err);
    return null;
  }
  const count = row && typeof row.count === "number" ? row.count : 0;
  const limit = keyLimit(keyRow);
  return { count, limit, remaining: limit - count, reset: resetEpoch() };
}

// Consume one request against the key's daily quota. The increment is
// a single atomic upsert and the RETURNING count is the decision: if
// it lands above the limit the request is denied with 429 (the unit
// stays counted — over-limit probes are not free). A D1 failure denies
// the request with 500 rather than letting it through uncounted.
// Returns { ok: true, stats } | { ok: false, stats } (at limit) |
// { error: true } (counter unavailable).
export async function consumeQuota(env, keyRow) {
  const limit = keyLimit(keyRow);
  const day = utcDay();
  let row;
  try {
    row = await env.TOWER_DB.prepare(
      "INSERT INTO usage_daily (key_hash, day, count) VALUES (?, ?, 1) " +
        "ON CONFLICT(key_hash, day) DO UPDATE SET count = count + 1 " +
        "RETURNING count"
    )
      .bind(keyRow.key_hash, day)
      .first();
  } catch (err) {
    console.error("consumeQuota upsert failed", err);
    return { error: true };
  }
  if (!row || typeof row.count !== "number") {
    console.error("consumeQuota returned no count");
    return { error: true };
  }
  const stats = {
    count: row.count,
    limit,
    remaining: limit - row.count,
    reset: resetEpoch(),
  };
  if (row.count > limit) return { ok: false, stats };
  return { ok: true, stats };
}

// Authenticate a request. Returns { key } on success or { response }
// with the error to send. Dormant order matters: without the D1
// binding the API answers 503 before any auth is attempted.
export async function authenticate(request, env) {
  if (!env.TOWER_DB) {
    return { response: json({ ok: false, error: "api not configured" }, 503) };
  }
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const presented = m ? m[1].trim() : "";
  if (!presented || !presented.startsWith(KEY_PREFIX)) {
    return {
      response: json({ ok: false, error: "missing or invalid api key" }, 401),
    };
  }
  const hash = await sha256Hex(presented);
  let row = null;
  try {
    row = await env.TOWER_DB.prepare(
      "SELECT * FROM api_keys WHERE key_hash = ?"
    )
      .bind(hash)
      .first();
  } catch {
    return { response: json({ ok: false, error: "api lookup failed" }, 500) };
  }
  if (!row) {
    return { response: json({ ok: false, error: "invalid api key" }, 401) };
  }
  if (row.revoked) {
    return { response: json({ ok: false, error: "api key revoked" }, 403) };
  }
  if (row.past_due) {
    return {
      response: json(
        { ok: false, error: "subscription payment past due — update billing to restore access" },
        402
      ),
    };
  }
  return { key: row };
}

// Full gate for v1 endpoints that consume quota: dormant check, auth,
// then one unit of quota. Returns { key, stats } or { response }.
export async function gateWithQuota(request, env) {
  const a = await authenticate(request, env);
  if (a.response) return a;
  const q = await consumeQuota(env, a.key);
  if (q.error) {
    return {
      response: json({ ok: false, error: "usage counter unavailable" }, 500),
    };
  }
  if (!q.ok) {
    return {
      response: json(
        { ok: false, error: "daily limit exceeded", limit: q.stats.limit, reset: q.stats.reset },
        429,
        rateHeaders(q.stats)
      ),
    };
  }
  return { key: a.key, stats: q.stats };
}

// ----- Key delivery email (Resend, same pattern as [form].js) -----------

const FROM = "Antarctic Labs <noreply@antarctic-labs.com>";

export async function sendApiKeyEmail(env, { to, plaintext, plan, keyHash }) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, notConfigured: true };
  const paid = plan && plan !== "free";
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const lines = [
    "Your Tower of Babel API key:",
    "",
    plaintext,
    "",
    "This key is shown only in this email. It is stored on our side only",
    "as a hash, so it can never be shown again. Keep it secret.",
    "",
    paid
      ? `Plan: ${plan} — ${limit.toLocaleString()} requests per day.`
      : `Plan: free — ${limit} requests per day, catalog search and metadata, non-commercial use.`,
    "",
    "Use it as a Bearer token:",
    "  Authorization: Bearer <your key>",
    "Base URL: https://antarctic-labs.com/api/v1",
    "Docs: https://antarctic-labs.com/tower-of-babel/api",
    "",
    "If you lose this key, request a new one on the API page — issuing a",
    "new key revokes the old one. Billing is managed through Stripe; the",
    "receipt for any payment includes a manage-billing link.",
  ];
  let res;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // One delivery per minted key: a retried send with the same key
        // hash returns the original send instead of emailing twice.
        ...(keyHash ? { "Idempotency-Key": `api-key-${keyHash}` } : {}),
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: "Your Tower of Babel API key",
        text: lines.join("\n"),
      }),
    });
  } catch (err) {
    console.error("api key email send failed", err);
    return { ok: false, error: "email provider unreachable" };
  }
  if (!res.ok) return { ok: false, error: `resend ${res.status}` };
  return { ok: true };
}

// Insert a fresh key row for (email, plan) and email the plaintext once.
// Emails are stored lowercased everywhere so the mint endpoint, Stripe
// Checkout and the webhook all agree on one identity per address.
// Returns { ok, emailed, keyHash } — the plaintext never leaves this
// function except via the delivery email. Callers that require delivery
// (the webhook) check `emailed` and can roll the row back via keyHash.
export async function mintKey(env, { email, plan, stripeCustomerId }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const plaintext = generateKey();
  const hash = await sha256Hex(plaintext);
  const now = new Date().toISOString();
  await env.TOWER_DB.prepare(
    "INSERT INTO api_keys (key_hash, prefix, last4, email, stripe_customer_id, plan, daily_limit, revoked, past_due, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)"
  )
    .bind(
      hash,
      KEY_PREFIX,
      plaintext.slice(-4),
      normalizedEmail,
      stripeCustomerId || null,
      plan,
      PLAN_LIMITS[plan] || PLAN_LIMITS.free,
      now,
      now
    )
    .run();
  const sent = await sendApiKeyEmail(env, {
    to: normalizedEmail,
    plaintext,
    plan,
    keyHash: hash,
  });
  if (!sent.ok) {
    console.error("api key minted but delivery email failed", sent.error || "");
  }
  return { ok: true, emailed: sent.ok, keyHash: hash };
}
