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
// Idempotency: every event id is recorded in processed_events with a
// status — 'received' on first sight, flipped to 'processed' only
// AFTER the handler succeeds. A redelivery of a 'processed' event
// returns 200 without re-handling; a redelivery of a 'received' event
// (an earlier attempt crashed mid-handler) is handled again, so a
// transient failure can never permanently swallow a paid checkout.
// (Insert-first-and-always-skip — Stripe's own documented pattern —
// has exactly that crash window; audit B1.)
//
// Events (Tower API only — sessions/subscriptions carry
// metadata.source="tower-api"; on invoices that metadata lives at
// subscription_details.metadata, NOT invoice.metadata):
//   checkout.session.completed / .async_payment_succeeded
//     (subscription, payment_status != unpaid) -> create or upgrade
//     the key row for the customer email, email a NEW key on first
//     creation. An unpaid session provisions NOTHING: entitlement
//     waits for invoice.paid (Stripe's documented gate for
//     delayed-notification payment methods).
//   invoice.paid            -> apply the subscription's plan (create
//     or upgrade), past_due=0; clears revoked ONLY when the
//     subscription was not deleted (a late invoice.paid must never
//     resurrect a deleted subscription's key)
//   invoice.payment_failed  -> past_due=1 for that customer
//   customer.subscription.deleted -> revoked=1, sub_deleted=1
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
      .bind(String(email).trim().toLowerCase())
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

// Source filter for invoice events: the subscription metadata rides
// at subscription_details.metadata on invoices. When metadata is
// present and names a different source, the event is not ours; when it
// is absent entirely, fall back to the customer match (legacy rows).
function invoiceIsOurs(obj) {
  const md = obj.subscription_details?.metadata;
  if (md && typeof md.source === "string" && md.source) {
    return md.source === "tower-api";
  }
  return true;
}

// Create or upgrade the key row for a paid plan. On first creation the
// new key is emailed; if that email fails, the undeliverable row is
// removed and an error is thrown so the webhook answers non-2xx, Stripe
// retries, and the retry mints a fresh key instead of the customer
// sitting paid and keyless behind a 200.
async function provisionPaidKey(env, { email, customerId, plan, now }) {
  const existing = await findKeyRow(env, { customerId, email });
  if (existing) {
    await env.TOWER_DB.prepare(
      "UPDATE api_keys SET plan = ?, daily_limit = ?, stripe_customer_id = ?, past_due = 0, revoked = 0, sub_deleted = 0, updated_at = ? WHERE key_hash = ?"
    )
      .bind(plan, PLAN_LIMITS[plan], customerId, now, existing.key_hash)
      .run();
    return;
  }
  if (!email) {
    console.error("stripe webhook: paid provisioning without an email", plan);
    return;
  }
  const minted = await mintKey(env, { email, plan, stripeCustomerId: customerId });
  if (!minted.emailed) {
    await env.TOWER_DB.prepare("DELETE FROM api_keys WHERE key_hash = ?")
      .bind(minted.keyHash)
      .run()
      .catch((err) => console.error("stripe webhook: rollback of undelivered key failed", err));
    throw new Error("api key delivery email failed");
  }
}

async function handleEvent(env, event) {
  const obj = event.data?.object || {};
  const now = new Date().toISOString();

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    if (obj.mode !== "subscription") return;
    if (obj.metadata?.source !== "tower-api") return;
    const plan = obj.metadata?.plan;
    if (!PLAN_LIMITS[plan] || plan === "free") return;
    // Provisioning gate: a completed session is not a completed
    // payment for delayed-notification methods. Unpaid waits for
    // invoice.paid / async_payment_succeeded.
    if (obj.payment_status === "unpaid") return;
    const email = obj.customer_details?.email || obj.customer_email || null;
    const customerId = typeof obj.customer === "string" ? obj.customer : null;
    await provisionPaidKey(env, { email, customerId, plan, now });
    return;
  }

  if (event.type === "invoice.paid") {
    if (!invoiceIsOurs(obj)) return;
    const plan = obj.subscription_details?.metadata?.plan;
    const customerId = typeof obj.customer === "string" ? obj.customer : null;
    // A deleted subscription stays deleted: a late invoice.paid for it
    // clears past_due bookkeeping only — it must not re-provision or
    // un-revoke the key (provisionPaidKey would clear sub_deleted).
    const existingRow = customerId
      ? await findKeyRow(env, { customerId, email: null })
      : null;
    const deletedSub = !!existingRow && existingRow.sub_deleted === 1;
    if (!deletedSub && PLAN_LIMITS[plan] && plan !== "free") {
      // Recurring payment (or the first payment after an unpaid
      // checkout): make sure the plan entitlement is in place.
      await provisionPaidKey(env, {
        email: obj.customer_email || null,
        customerId,
        plan,
        now,
      });
    }
    // Clear past_due. Un-revoke ONLY when this subscription was not
    // deleted — never resurrect a deleted subscription's key.
    await setByCustomer(
      env,
      obj.customer,
      "UPDATE api_keys SET past_due = 0, revoked = CASE WHEN sub_deleted = 1 THEN revoked ELSE 0 END, updated_at = ? WHERE stripe_customer_id = ?",
      [now]
    );
    return;
  }

  if (event.type === "invoice.payment_failed") {
    if (!invoiceIsOurs(obj)) return;
    await setByCustomer(
      env,
      obj.customer,
      "UPDATE api_keys SET past_due = 1, updated_at = ? WHERE stripe_customer_id = ?",
      [now]
    );
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    const md = obj.metadata;
    if (md && typeof md.source === "string" && md.source && md.source !== "tower-api") return;
    await setByCustomer(
      env,
      obj.customer,
      "UPDATE api_keys SET revoked = 1, sub_deleted = 1, updated_at = ? WHERE stripe_customer_id = ?",
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
  ).catch((err) => {
    console.error("stripe webhook: signature verification error", err);
    return false;
  });
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

  // Idempotency gate (status pattern — see header). First sight of an
  // event inserts a 'received' marker; only a 'processed' marker makes
  // a redelivery a no-op. A 'received' marker means an earlier attempt
  // died mid-handler, so the event is handled again now.
  const ins = await env.TOWER_DB.prepare(
    "INSERT OR IGNORE INTO processed_events (event_id, processed_at, status) VALUES (?, ?, 'received')"
  )
    .bind(event.id, new Date().toISOString())
    .run();
  const changes = ins?.meta?.changes ?? ins?.changes ?? 1;
  if (changes === 0) {
    const seen = await env.TOWER_DB.prepare(
      "SELECT status FROM processed_events WHERE event_id = ?"
    )
      .bind(event.id)
      .first()
      .catch((err) => {
        console.error("stripe webhook: idempotency lookup failed", event.id, err);
        return null;
      });
    if (seen && seen.status === "processed") {
      return json({ ok: true, duplicate: true });
    }
  }

  try {
    await handleEvent(env, event);
  } catch (err) {
    // Marker stays 'received': Stripe retries on the 500 and the
    // retry re-handles instead of being swallowed as a duplicate.
    console.error("stripe webhook: handler failed", event.id, event.type, err);
    return json({ ok: false, error: "handler failed" }, 500);
  }
  await env.TOWER_DB.prepare(
    "UPDATE processed_events SET status = 'processed', processed_at = ? WHERE event_id = ?"
  )
    .bind(new Date().toISOString(), event.id)
    .run()
    .catch((err) =>
      console.error("stripe webhook: could not mark event processed", event.id, err)
    );
  return json({ ok: true });
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
