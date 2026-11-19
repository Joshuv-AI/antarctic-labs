// Serves /sitemap-index.xml — the sitemap index for the site.
//
// Since 2026-11-18 (AdSense plan item 3 — shrink the presented corpus
// to a strong core) the index advertises exactly two sitemaps:
//
//   1. /sitemap.xml       the canonical routes (build-generated):
//                          homepage, curated collection and shelf
//                          landings, site pages.
//   2. /sitemap-core.xml  the 20,000-entry core set — the catalog's
//                          bootstrap prefix, served by
//                          functions/sitemap-core.xml.js.
//
// The per-shard entry sitemaps at /sitemap-entries/<n>.xml still
// serve (their function is unchanged) and every entry remains
// reachable and crawlable through the library itself — but the index
// no longer presents the full 2.56M undifferentiated catalog as the
// site's face to crawlers. robots.txt advertises this index alongside
// /sitemap.xml itself, so crawlers reading either discover the same
// curated set. The index is a fixed document now (the core function's
// own data still follows the catalog), edge-cached for 24h.
//
// (History: this index previously listed one <sitemap> per catalog
// shard — 168 shards × 45,000 entry URLs. The Phase 2 /sitemap-hubs.xml
// entry was removed 2026-10-24 with the hub pages themselves.)

const SITE = "https://antarctic-labs.com";
const CACHE_TTL_SECONDS = 24 * 3600;

const BODY =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  `  <sitemap>\n` +
  `    <loc>${SITE}/sitemap.xml</loc>\n` +
  `  </sitemap>\n` +
  `  <sitemap>\n` +
  `    <loc>${SITE}/sitemap-core.xml</loc>\n` +
  `  </sitemap>\n` +
  `</sitemapindex>\n`;

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const res = new Response(BODY, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
