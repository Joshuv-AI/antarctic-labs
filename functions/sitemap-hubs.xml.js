// Serves /sitemap-hubs.xml — a <urlset> of every Phase 2 hub page, and
// is listed from /sitemap-index.xml (see functions/sitemap-index.xml.js).
//
// The hub set is derived from the catalog by functions/_lib/tower-hubs.js
// (13 traditions, top-50 authors, 6 declassified programmes, the hubs
// index, and the course primary-sources hub), so the sitemap lists
// exactly the hub URLs that resolve — no dead author slugs, no empty
// traditions. Paginated hub URLs (?page=N) are deliberately NOT listed:
// page 1 is the canonical hub and pagination links are crawlable from
// it. Rendered output is edge-cached 24h, matching the other sitemap
// functions. No <lastmod>: hub membership changes with the catalog and
// no honest per-hub date exists.

import { SITE, escapeXml } from "./_lib/tower-catalog.js";
import { HUBS_BASE, getHubIndex } from "./_lib/tower-hubs.js";

const CACHE_TTL_SECONDS = 24 * 3600;

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let idx;
  try {
    idx = await getHubIndex();
  } catch (err) {
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "3600" },
    });
  }

  const urls = [
    HUBS_BASE,
    ...idx.hubPaths,
  ];

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ];
  for (const p of urls) {
    lines.push(`  <url>`, `    <loc>${escapeXml(SITE + p)}</loc>`, `  </url>`);
  }
  lines.push(`</urlset>`, ``);

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
