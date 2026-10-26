// Cloudflare Pages Function — Tower of Babel API key minting.
//
//   POST /api/keys  -> { email, website? }
//
// No accounts: possession of the email inbox is the identity (the DPLA
// model). The generated key is emailed to that address exactly once and
// stored only as a SHA-256 hash in D1 (binding TOWER_DB). The HTTP
// response NEVER contains the key.
//
// Rotation: minting for an email that already holds an active FREE key
// revokes that key and issues a new one. An active PAID key is never
// revoked by this endpoint — its owner is told by email that the paid
// key is still active and to reply for a manual rotation, so a paid
// subscription can never be silently downgraded by a free mint.
//
// Dormant state: without the TOWER_DB binding this answers 503, which
// the API page renders as a graceful "being switched on" notice.

import { json, mintKey, PLAN_LIMITS } from "../_lib/api-auth.js";

// Light per-isolate rate limit: max 8 submissions per IP per 10 minutes
// (same pattern as [form].js).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 2000) hits.clear();
  return arr.length > 8;
}

const str = (v) => (typeof v === "string" ? v.trim().slice(0, 8000) : "");

async function sendNotice(env, { to, subject, text }) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Antarctic Labs <noreply@antarctic-labs.com>",
        to: [to],
        subject,
        text,
      }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.TOWER_DB) {
    return json({ ok: false, error: "api keys not configured" }, 503);
  }
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  if (rateLimited(ip)) {
    return json({ ok: false, error: "too many requests" }, 429);
  }
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  if (!data || typeof data !== "object") {
    return json({ ok: false, error: "invalid payload" }, 400);
  }
  // Honeypot: bots fill it, humans never see it. Swallow silently.
  if (str(data.website).length > 0) return json({ ok: true });

  const email = str(data.email).slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "invalid email" }, 400);
  }

  // Existing active keys for this email.
  let existing = [];
  try {
    const res = await env.TOWER_DB.prepare(
      "SELECT key_hash, plan FROM api_keys WHERE email = ? AND revoked = 0"
    )
      .bind(email)
      .all();
    existing = (res && res.results) || [];
  } catch {
    return json({ ok: false, error: "api lookup failed" }, 500);
  }

  const paidRow = existing.find((r) => r.plan && r.plan !== "free");
  if (paidRow) {
    // Never revoke or downgrade a paid key from the free mint endpoint.
    await sendNotice(env, {
      to: email,
      subject: "Your Tower of Babel API key",
      text: [
        `This email already holds an active ${paidRow.plan} Tower of Babel API key, so no new free key was issued and nothing was changed.`,
        "",
        "Keys are stored only as hashes and cannot be re-shown. If you have lost your paid key, reply to this email and we will rotate it for you.",
      ].join("\n"),
    });
    return json({ ok: true });
  }

  // Rotate free keys: revoke the old, then mint.
  for (const row of existing) {
    await env.TOWER_DB.prepare(
      "UPDATE api_keys SET revoked = 1, updated_at = ? WHERE key_hash = ?"
    )
      .bind(new Date().toISOString(), row.key_hash)
      .run();
  }

  const minted = await mintKey(env, { email, plan: "free" });
  if (!minted.emailed) {
    // The row exists; without email delivery the owner cannot learn the
    // key. Surface a send failure rather than a silent success.
    return json({ ok: false, error: "key email could not be sent" }, 502);
  }
  return json({ ok: true, plan: "free", daily_limit: PLAN_LIMITS.free });
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
