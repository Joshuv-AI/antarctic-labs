// Serves /sitemap-entries/<n>.xml — one <urlset> of Tower of Babel entry
// URLs: exactly the catalog shard n (0-based), i.e. catalog-<nn>.json in
// the repo. ~15-16k URLs per file, far under the sitemap protocol's
// 50,000-URL / 50 MB per-file limits.
//
// Sharding follows the catalog shards 1:1 (instead of fixed 45k positional
// windows) so each request fetches and parses exactly one shard. The
// positional walk parsed up to all 25 shards per request and exceeded the
// Workers CPU time limit at live scale (diagnosed 2026-10-24 alongside the
// hub pages). The sitemap index lists shards 0..count-1 (live count from
// catalog-shards/count.json via getShardCount); crawlers
// discover the scheme from the index, so the numbering is an internal
// detail. No <lastmod> is emitted: the catalog carries no per-entry dates,
// and an invented date would be worse than none.

import {
  getShardCount,
  entryUrl,
  escapeXml,
  getShardRecords,
} from "../_lib/tower-catalog.js";

const CACHE_TTL_SECONDS = 24 * 3600;

export async function onRequest(context) {
  const { request, params } = context;
  const n = parseInt(String(params && params.n ? params.n : ""), 10);
  const shardCount = await getShardCount();
  if (!Number.isFinite(n) || n < 0 || n >= shardCount) {
    return new Response("Not found", { status: 404 });
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const records = await getShardRecords(n);
  if (!records) {
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

  if (urls.length === 0) {
    return new Response("Not found", { status: 404 });
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
