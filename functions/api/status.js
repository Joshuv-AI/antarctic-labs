// Cloudflare Pages Function — Tower of Babel API status.
//
//   GET /api/status -> { ok, keys_configured, webhook_configured,
//                        subscriptions_open }
//
// Booleans only — no secrets, no values. The API page reads this on
// mount to decide whether subscribe buttons render at all: a paying
// user must never meet a dead or premature checkout.

import { json } from "../_lib/api-auth.js";

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    keys_configured: !!env.TOWER_DB,
    webhook_configured: !!env.STRIPE_WEBHOOK_SECRET,
    subscriptions_open: env.API_LIVE === "1",
  });
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
