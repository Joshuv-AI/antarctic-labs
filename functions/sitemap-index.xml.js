// Serves /sitemap-index.xml — a sitemap index covering the whole site:
//
//   1. /sitemap.xml          the canonical routes (build-generated, ~14 URLs)
//   2. /sitemap-entries/N.xml  one <urlset> per 45,000 library entries,
//      streamed from the catalog shards by
//      functions/sitemap-entries/[n].js
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

import {
  SITE,
  SHARD_COUNT,
  escapeXml,
  getShardRecords,
} from "./_lib/tower-catalog.js";

export const ENTRIES_PER_SITEMAP = 45000;
const CACHE_TTL_SECONDS = 24 * 3600;

export async function catalogEntryTotal() {
  const counts = await Promise.all(
    Array.from({ length: SHARD_COUNT }, (_, i) =>
      getShardRecords(i).then((r) => (r ? r.length : 0))
    )
  );
  return counts.reduce((a, b) => a + b, 0);
}

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const total = await catalogEntryTotal();
  if (!total) {
    // Catalog unreachable — tell crawlers to retry later instead of
    // caching an empty index.
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "3600" },
    });
  }
  const shards = Math.ceil(total / ENTRIES_PER_SITEMAP);
  const today = new Date().toISOString().slice(0, 10);

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <sitemap>`,
    `    <loc>${SITE}/sitemap.xml</loc>`,
    `  </sitemap>`,
  ];
  for (let n = 1; n <= shards; n++) {
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
