// Serves /sitemap-entries/<n>.xml — one <urlset> slice of the Tower of
// Babel entry URLs: https://antarctic-labs.com/tower-of-babel/library/<id>
//
// Slice n covers catalog positions [(n-1)*45000, n*45000) in catalog order
// (shard order, then in-shard order — the same order /catalog.json serves).
// 45,000 stays under the sitemap protocol's 50,000-URL per-file limit with
// headroom, and keeps each XML file around ~5 MB, far under the 50 MB cap.
//
// Data source and freshness match functions/catalog.json.js and the
// sitemap index: the catalog shards on main. Each rendered shard is
// edge-cached for 24h, so the sequential shard walk below runs at most
// once per shard per PoP per day; crawler fetches after that are pure
// edge reads. No <lastmod> is emitted: the catalog carries no per-entry
// dates, and an invented date would be worse than none.

import {
  SHARD_COUNT,
  entryUrl,
  escapeXml,
  getShardRecords,
} from "../_lib/tower-catalog.js";

const ENTRIES_PER_SITEMAP = 45000;
const CACHE_TTL_SECONDS = 24 * 3600;

export async function onRequest(context) {
  const { request, params } = context;
  const n = parseInt(String(params && params.n ? params.n : ""), 10);
  if (!Number.isFinite(n) || n < 1) {
    return new Response("Not found", { status: 404 });
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const start = (n - 1) * ENTRIES_PER_SITEMAP;
  const end = start + ENTRIES_PER_SITEMAP;

  // Walk the shards in catalog order, parsing one at a time and discarding
  // it before the next, until the requested window is filled.
  const urls = [];
  let offset = 0;
  for (let i = 0; i < SHARD_COUNT; i++) {
    const records = await getShardRecords(i);
    if (!records) {
      // A shard failing mid-walk means positions after it are unknown —
      // serve what we have only if the window is already complete.
      if (urls.length === 0 && offset <= start) {
        return new Response("Sitemap temporarily unavailable", {
          status: 503,
          headers: { "Retry-After": "3600" },
        });
      }
      break;
    }
    const shardStart = offset;
    offset += records.length;
    if (offset <= start) continue; // whole shard before the window
    const from = Math.max(0, start - shardStart);
    const to = Math.min(records.length, end - shardStart);
    for (let k = from; k < to; k++) {
      const id = records[k] && records[k].artifact_id;
      if (id) urls.push(entryUrl(id));
    }
    if (offset >= end) break;
  }

  if (urls.length === 0) {
    // Past the end of the catalog (or the catalog is unreachable): a 404
    // here is honest and self-corrects as the catalog grows into the
    // sitemap index's range.
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
