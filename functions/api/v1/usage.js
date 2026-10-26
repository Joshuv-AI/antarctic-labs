// Cloudflare Pages Function — Tower API v1: usage for the caller's key.
//
//   GET /api/v1/usage
//
// No account, no dashboard: a key holder checks their own usage with
// the key itself. Reading usage does not consume quota.

import { json, authenticate, usageStats, rateHeaders } from "../../_lib/api-auth.js";

export async function onRequestGet({ request, env }) {
  const a = await authenticate(request, env);
  if (a.response) return a.response;
  const stats = await usageStats(env, a.key);
  return json(
    {
      ok: true,
      plan: a.key.plan || "free",
      today: {
        count: stats.count,
        limit: stats.limit,
        remaining: Math.max(0, stats.remaining),
      },
      key_hint: a.key.last4 || null,
    },
    200,
    rateHeaders(stats)
  );
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
