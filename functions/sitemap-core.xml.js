// Serves /sitemap-core.xml — the entry sitemap the index advertises
// (2026-11-18, AdSense plan item 3: shrink the presented corpus to a
// strong core).
//
// The core is the catalog's founding set: the first 20,000 catalog
// records — the same prefix the site itself preloads as
// catalog-bootstrap.json (getBootstrapRecords in _lib/tower-catalog.js).
// Every record in that prefix carries its text (download_status
// AVAILABLE across the prefix, verified against the published
// bootstrap), and the prefix is the library's original hand-built
// corpus: the books, sacred texts, declassified documents, founding
// documents and early papers the library began with, most of them
// carrying the revamp's per-entry introductions.
//
// The remaining catalog stays fully reachable and readable — its
// per-shard sitemaps at /sitemap-entries/<n>.xml still serve — but the
// index no longer presents 2.56M undifferentiated URLs as the site's
// face to crawlers. Selection follows the catalog's own bootstrap, so
// it can never drift from what the site serves; no per-entry <lastmod>
// is emitted (the catalog carries no per-entry dates).

import {
  getBootstrapRecords,
  entryUrl,
  escapeXml,
} from "./_lib/tower-catalog.js";

const CACHE_TTL_SECONDS = 24 * 3600;

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const records = await getBootstrapRecords();
  if (!records || !records.length) {
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "3600" },
    });
  }

  const urls = [];
  for (const r of records) {
    const id = r && r.artifact_id;
    if (id) urls.push(entryUrl(id));
  }
  if (!urls.length) {
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "3600" },
    });
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`).join("\n") +
    `\n</urlset>\n`;

  const res = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
