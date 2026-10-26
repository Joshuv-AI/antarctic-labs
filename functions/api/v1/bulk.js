// Cloudflare Pages Function — Tower API v1: bulk snapshot packages.
//
//   GET /api/v1/bulk
//
// Lists the corpus snapshot packages a key may download. Snapshots are
// pre-built, versioned packages (texts + checksum manifest, the
// OpenAlex/LOC package standard) — never generated on request. Today
// the list carries the free 100-work sample collection from the
// Commissions Desk; commercial snapshots slot into the same response
// shape as they are published.
//
// Auth: Bearer key (any plan). Consumes one unit of daily quota.

import { json, gateWithQuota, rateHeaders } from "../../_lib/api-auth.js";

const SITE = "https://antarctic-labs.com";

const PACKAGES = [
  {
    name: "Sample Collection — Foundational Documents",
    works: 100,
    manifest_url: `${SITE}/commissions/sample-manifest.json`,
    download_url: `${SITE}/commissions/sample-collection.zip`,
    access: "any key",
    note: "The free sample published by the Commissions Desk: 100 public-domain documents with a SHA-256 manifest, in the same package format as commissioned collections.",
  },
];

export async function onRequestGet({ request, env }) {
  const g = await gateWithQuota(request, env);
  if (g.response) return g.response;
  return json({ ok: true, packages: PACKAGES }, 200, rateHeaders(g.stats));
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
