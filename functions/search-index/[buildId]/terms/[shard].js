// Serves /search-index/<buildId>/terms/<n>.json — the deep-search term
// shards (2.5 GiB total at 121k texts), which cannot be deployed as static
// Cloudflare Pages files (25 MiB per-file cap, 20,000-file site limit, and
// the sheer upload volume). The build holds the shard dirs out of dist/
// (scripts/stage-deploy.mjs); this function proxies them from the git
// repo's raw content with edge caching.
//
// IMPORTANT: shards are fetched at the DEPLOYED commit
// (CF_PAGES_COMMIT_SHA), not main — the manifest's buildId must always
// match the term shards shipped in the same deploy.

const REPO = "Joshuv-AI/antarctic-labs-texts";

export async function onRequest(context) {
  const buildId = context.params.buildId || "";
  let shard = context.params.shard || "";
  try {
    shard = decodeURIComponent(shard);
  } catch {
    /* keep the raw param */
  }
  // Strict validation: 12-char hex buildId, numeric "<n>.json" shard.
  if (!/^[0-9a-f]{12}$/.test(buildId) || !/^\d{1,3}\.json$/.test(shard)) {
    return new Response("Not found", { status: 404 });
  }
  const n = parseInt(shard, 10);
  if (n < 0 || n > 255) {
    return new Response("Not found", { status: 404 });
  }

  const sha = "main"; // index lives in the texts repo; "main" keeps manifest+shards consistent
  const ORIGIN =
    `https://raw.githubusercontent.com/${REPO}/${sha}/search-index-data/` +
    `${buildId}/terms/${n}.json`;

  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (context.request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const upstream = await fetch(ORIGIN, {
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!upstream.ok) {
    return new Response("Not found", { status: 404 });
  }

  const res = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
  if (context.request.method === "GET") {
    context.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return res;
}
