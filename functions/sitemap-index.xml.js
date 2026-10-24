// Serves /sitemap-index.xml — a sitemap index covering the whole site:
//
//   1. /sitemap.xml          the canonical routes (build-generated, ~14 URLs)
//   2. /sitemap-entries/N.xml  one <urlset> per 45,000 library entries,
//      streamed from the catalog shards by
//      functions/sitemap-entries/[n].js
//   3. /sitemap-hubs.xml     the Phase 2 hub pages (functions/sitemap-hubs.xml.js)
//      [PHASE 2 CHANGE: this entry and its <sitemap> block below were
//      added in Phase 2; everything else is the Phase 1 function as
//      deployed.]
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

import { SITE, SHARD_COUNT, escapeXml } from "./_lib/tower-catalog.js";

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
  const today = new Date().toISOString().slice(0, 10);

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <sitemap>`,
    `    <loc>${SITE}/sitemap.xml</loc>`,
    `  </sitemap>`,
  ];
  for (let n = 0; n < SHARD_COUNT; n++) {
    lines.push(
      `  <sitemap>`,
      `    <loc>${SITE}/sitemap-entries/${n}.xml</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `  </sitemap>`
    );
  }
  // PHASE 2: hub pages urlset.
  lines.push(
    `  <sitemap>`,
    `    <loc>${SITE}/sitemap-hubs.xml</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `  </sitemap>`
  );
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
