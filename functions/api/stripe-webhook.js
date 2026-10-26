// Cloudflare Pages Function — Stripe webhook for the Tower API.
//
//   POST /api/stripe-webhook
//
// Dormant state: without STRIPE_WEBHOOK_SECRET or the TOWER_DB binding
// this answers 503. Stripe retries 5xx with backoff, so events sent
// before activation are re-delivered later rather than lost — that is
// the correct dormant behavior, do not "fix" it to 200.
//
// Signatures are verified with WebCrypto (no Node Stripe SDK on Pages):
// HMAC-SHA256 over `${t}.${rawBody}` with the endpoint secret, compared
// timing-safe, 300 s timestamp tolerance.
//
// Idempotency: every event id is INSERT OR IGNOREd into
// processed_events before handling; a duplicate delivery returns 200
// without re-handling, so retries can never mint two keys.
//
// Events (Tower API only — sessions carry metadata.source="tower-api"):
//   checkout.session.completed (subscription) -> create or upgrade the
//     key row for the customer email, email a NEW key on first creation
//   invoice.paid            -> past_due=0, revoked=0 for that customer
//   invoice.payment_failed  -> past_due=1 for that customer
//   customer.subscription.deleted -> revoked=1 for that customer
// Anything else -> 200, ignored.

import { json, mintKey, PLAN_LIMITS } from "../_lib/api-auth.js";

const enc = new TextEncoder();

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySignature(rawBody, header, secret) {
  if (!header) return false;
  let t = null;
  const v1s = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") t = v;
    if (k === "v1") v1s.push(v);
  }
  if (!t || v1s.length === 0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1s.some((v1) => timingSafeEqual(v1, expected));
}

async function findKeyRow(env, { customerId, email }) {
  if (customerId) {
    const row = await env.TOWER_DB.prepare(
      "SELECT * FROM api_keys WHERE stripe_customer_id = ? ORDER BY created_at DESC"
    )
      .bind(customerId)
      .first();
    if (row) return row;
  }
  if (email) {
    const row = await env.TOWER_DB.prepare(
      "SELECT * FROM api_keys WHERE email = ? ORDER BY created_at DESC"
    )
      .bind(email)
      .first();
    if (row) return row;
  }
  return null;
}

async function setByCustomer(env, customerId, sql, extraBinds = []) {
  if (!customerId) return;
  await env.TOWER_DB.prepare(sql)
    .bind(...extraBinds, customerId)
    .run();
}

async function handleEvent(env, event) {
  const obj = event.data?.object || {};
  const now = new Date().toISOString();

  if (event.type === "checkout.session.completed") {
    if (obj.mode !== "subscription") return;
    if (obj.metadata?.source !== "tower-api") return;
    const plan = obj.metadata?.plan;
    if (!PLAN_LIMITS[plan] || plan === "free") return;
    const email = obj.customer_details?.email || obj.customer_email || null;
    const customerId = typeof obj.customer === "string" ? obj.customer : null;
    const existing = await findKeyRow(env, { customerId, email });
    if (existing) {
      await env.TOWER_DB.prepare(
        "UPDATE api_keys SET plan = ?, daily_limit = ?, stripe_customer_id = ?, past_due = 0, revoked = 0, updated_at = ? WHERE key_hash = ?"
      )
        .bind(plan, PLAN_LIMITS[plan], customerId, now, existing.key_hash)
        .run();
    } else if (email) {
      await mintKey(env, { email, plan, stripeCustomerId: customerId });
    }
    return;
  }

  if (event.type === "invoice.paid") {
    await setByCustomer(
      env,
      obj.customer,
      "UPDATE api_keys SET past_due = 0, revoked = 0, updated_at = ? WHERE stripe_customer_id = ?",
      [now]
    );
    return;
  }

  if (event.type === "invoice.payment_failed") {
    await setByCustomer(
      env,
      obj.customer,
      "UPDATE api_keys SET past_due = 1, updated_at = ? WHERE stripe_customer_id = ?",
      [now]
    );
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    await setByCustomer(
      env,
      obj.customer,
      "UPDATE api_keys SET revoked = 1, updated_at = ? WHERE stripe_customer_id = ?",
      [now]
    );
    return;
  }
  // All other events: ignore.
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.TOWER_DB) {
    return json({ ok: false, error: "webhook not configured" }, 503);
  }
  const rawBody = await request.text();
  const okSig = await verifySignature(
    rawBody,
    request.headers.get("Stripe-Signature"),
    env.STRIPE_WEBHOOK_SECRET
  ).catch(() => false);
  if (!okSig) {
    return json({ ok: false, error: "invalid signature" }, 400);
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "invalid payload" }, 400);
  }
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
    return json({ ok: false, error: "invalid event" }, 400);
  }

  // Idempotency gate.
  const ins = await env.TOWER_DB.prepare(
    "INSERT OR IGNORE INTO processed_events (event_id, processed_at) VALUES (?, ?)"
  )
    .bind(event.id, new Date().toISOString())
    .run();
  const changes = ins?.meta?.changes ?? ins?.changes ?? 1;
  if (changes === 0) {
    return json({ ok: true, duplicate: true });
  }

  try {
    await handleEvent(env, event);
  } catch {
    return json({ ok: false, error: "handler failed" }, 500);
  }
  return json({ ok: true });
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
