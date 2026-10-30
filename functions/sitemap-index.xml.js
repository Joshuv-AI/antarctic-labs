// Serves /sitemap-index.xml — a sitemap index covering the whole site:
//
//   1. /sitemap.xml          the canonical routes (build-generated, ~14 URLs)
//   2. /sitemap-entries/N.xml  one <urlset> per 45,000 library entries,
//      streamed from the catalog shards by
//      functions/sitemap-entries/[n].js
//   (The Phase 2 /sitemap-hubs.xml entry was removed 2026-10-24 with
//   the hub pages themselves: collections now live only as a filter on
//   the main Tower page, and the deleted hub URLs are left to 404 —
//   no redirects, no sitemap entry for them.)
//
// Why a function and not committed XML files: the catalog grows by tens of
// thousands of entries via data-only pushes that skip the site build
// ([CF-Pages-Skip]), so build-time sitemaps would silently go stale. This
// index reads the same source as functions/catalog.json.js (the catalog
// shards on main), so it is never older than the catalog the site itself
// serves. The rendered index is edge-cached for 24h; the shard count is
// recomputed from the shards' actual record counts, never hardcoded.
//
// <lastmod> here is the date this index document was generated — the only
// date we can state honestly at catalog scale. Entry urlsets carry no
// <lastmod> at all (per-entry dates are not in the catalog, and a made-up
// date is worse than none).

import { SITE, getShardCount, escapeXml } from "./_lib/tower-catalog.js";

const CACHE_TTL_SECONDS = 24 * 3600;

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Entry sitemaps follow the catalog shards 1:1 (shard n serves
  // /sitemap-entries/<n>.xml), so the index simply lists every shard.
  // (Previously this derived a positional slice count from a record
  // total; the per-shard scheme keeps each sitemap request to a single
  // shard parse, inside the Workers CPU limit.)
  const shardCount = await getShardCount();
  const today = new Date().toISOString().slice(0, 10);

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <sitemap>`,
    `    <loc>${SITE}/sitemap.xml</loc>`,
    `  </sitemap>`,
  ];
  for (let n = 0; n < shardCount; n++) {
    lines.push(
      `  <sitemap>`,
      `    <loc>${SITE}/sitemap-entries/${n}.xml</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `  </sitemap>`
    );
  }
  lines.push(`</sitemapindex>`, ``);

  const res = new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
