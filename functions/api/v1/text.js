// Cloudflare Pages Function — Tower API v1: full-text delivery.
//
//   GET /api/v1/text?id=<artifact_id>
//
// The free key tier is search + metadata only: full text through the
// API is a paid-plan feature (the same texts stay free to read and
// download on the site itself — the paid tier sells the API pipe, the
// throughput, and the commercial licence, never access). Paid plans
// get a 302 to the work's canonical .txt URL after the id is confirmed
// to exist in the catalog; an unknown id is a 404, not a redirect to a
// dead file.
//
// Auth: Bearer key (pro / commercial). Consumes one unit of daily
// quota for paid plans — charged only after the id is confirmed to
// exist, so a 404 never costs the caller quota.

import {
  json,
  authenticate,
  consumeQuota,
  usageStats,
  rateHeaders,
} from "../../_lib/api-auth.js";
import { getRecordById } from "../../_lib/tower-catalog.js";

const SITE = "https://antarctic-labs.com";

export async function onRequestGet({ request, env }) {
  const a = await authenticate(request, env);
  if (a.response) return a.response;

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) {
    const stats = await usageStats(env, a.key);
    return json({ ok: false, error: "id is required" }, 400, rateHeaders(stats));
  }

  if (a.key.plan === "free" || !a.key.plan) {
    const stats = await usageStats(env, a.key);
    return json(
      { ok: false, error: "full text via API requires a paid plan" },
      403,
      rateHeaders(stats)
    );
  }

  // Existence first: an unknown id is a 404 and costs no quota.
  const rec = await getRecordById(id).catch(() => null);
  if (!rec || rec.state !== "ok" || !rec.record.download_url) {
    const stats = await usageStats(env, a.key);
    return json({ ok: false, error: "unknown artifact id" }, 404, rateHeaders(stats));
  }

  const quota = await consumeQuota(env, a.key);
  if (quota.error) {
    return json({ ok: false, error: "usage counter unavailable" }, 500);
  }
  if (!quota.ok) {
    return json(
      { ok: false, error: "daily limit exceeded", limit: quota.stats.limit, reset: quota.stats.reset },
      429,
      rateHeaders(quota.stats)
    );
  }
  const headers = rateHeaders(quota.stats);

  const target = rec.record.download_url.startsWith("http")
    ? rec.record.download_url
    : `${SITE}${rec.record.download_url}`;
  return new Response(null, {
    status: 302,
    headers: { Location: target, ...headers },
  });
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
