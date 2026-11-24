// Serves /sitemap-priority.xml — the priority sitemap for the
// demand-pages program (2026-11-21): the author pages and study guides
// built for the library's highest-demand works, plus the entry URLs of
// the Wave 1 works themselves, each of which now carries an original
// introduction and curated cross-links. <lastmod> is the date this
// content was published (2026-11-21) — an honest date, not a freshness
// claim about the underlying catalog records. Registered in
// functions/sitemap-index.xml.js alongside /sitemap.xml and
// /sitemap-core.xml.

import { SITE, escapeXml } from "./_lib/tower-catalog.js";
import { PRIORITY_PATHS, DEMAND_LASTMOD } from "./_lib/demand-pages.js";
import { TEXT_OF_THE_DAY_PATH } from "./_lib/from-the-stacks.js";

const CACHE_TTL_SECONDS = 24 * 3600;

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const urls = PRIORITY_PATHS.map(
    (p) =>
      `  <url>\n    <loc>${escapeXml(SITE + p)}</loc>\n    <lastmod>${DEMAND_LASTMOD}</lastmod>\n  </url>`
  ).join("\n");
  // Text of the Day (2026-11-23, Return-Visit Option A): the standing
  // daily-feature page rides this sitemap; its content rotates daily,
  // so lastmod is the serving date, which is literally true.
  const stacksUrl = `  <url>\n    <loc>${escapeXml(SITE + TEXT_OF_THE_DAY_PATH)}</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n  </url>`;
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n${stacksUrl}\n</urlset>\n`;

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
