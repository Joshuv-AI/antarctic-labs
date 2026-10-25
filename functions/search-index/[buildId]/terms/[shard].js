// Serves /search-index/<buildId>/terms/<n>.json — the deep-search term
// shards. R2 route (2026-10-25): shards live in the R2 bucket
// tower-search-index under <buildId>/terms/, published by the GitHub
// Actions build; the bucket's public custom domain serves them. Fallback
// to the old texts-repo proxy when R2 404s, so search is no worse than
// today until the first R2 build lands.
//
// Validation is unchanged from the git route: buildId must be 12 lowercase
// hex chars, shard 0-255 — so the index still has at most 256 shards,
// and the client honors manifest.shards. Shard URLs are immutable per
// buildId, so the 24h edge cache here is safe.

const R2_BASE = "https://search-index.antarctic-labs.com";
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

  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (context.request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  // R2 first.
  let upstream = await fetch(`${R2_BASE}/${buildId}/terms/${n}.json`, {
    cf: { cacheTtl: 86400, cacheEverything: true },
  }).catch(() => null);
  // Fallback: texts repo (old path).
  if (!upstream || !upstream.ok) {
    upstream = await fetch(
      `https://raw.githubusercontent.com/${REPO}/main/search-index-data/${buildId}/terms/${n}.json`,
      { cf: { cacheTtl: 86400, cacheEverything: true } }
    ).catch(() => null);
  }
  if (!upstream || !upstream.ok) {
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
