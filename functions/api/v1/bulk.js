// Cloudflare Pages Function — Tower API v1: bulk snapshot packages.
//
//   GET /api/v1/bulk
//
// Lists the corpus snapshot packages a key may download. Snapshots are
// pre-built, versioned packages (texts + checksum manifest, the
// OpenAlex/LOC package standard) — never generated on request.
// Commercial snapshots slot into the response shape as they are
// published; the list is empty until the first one ships.
//
// Auth: Bearer key (any plan). Consumes one unit of daily quota.

import { json, gateWithQuota, rateHeaders } from "../../_lib/api-auth.js";

const SITE = "https://antarctic-labs.com";

const PACKAGES = [];

export async function onRequestGet({ request, env }) {
  const g = await gateWithQuota(request, env);
  if (g.response) return g.response;
  return json({ ok: true, packages: PACKAGES }, 200, rateHeaders(g.stats));
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
