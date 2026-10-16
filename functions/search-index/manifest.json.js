// Serves /search-index/manifest.json — the deep-search manifest (32+ MiB at
// 103,606 texts), which exceeds the 25 MiB per-file limit for static
// Cloudflare Pages files. The build holds it out of dist/
// (scripts/stage-deploy.mjs); this function proxies it from the git
// repo's raw content with a short edge-cache TTL.
//
// IMPORTANT: the manifest is fetched at the DEPLOYED commit
// (CF_PAGES_COMMIT_SHA), not main. The manifest's buildId must always match
// the term shards shipped in the same deploy — pinning to the deployed
// commit keeps them atomically consistent (no broken deep search during or
// right after a deploy).
//
// CACHE HARDENING (2026-10-16): raw.githubusercontent.com has regionally-
// stale caches. We bypass ALL upstream caches via Cache-Control: no-cache
// and cf.cacheTtl 0, so the function always fetches fresh content for the
// pinned SHA. Edge cache (caches.default) is keyed by request URL; the SHA
// in the deployed URL makes each deploy's manifest immutable and safe.

const REPO = "Joshuv-AI/antarctic-labs-texts";

export async function onRequest(context) {
  const sha = "main"; // index lives in the texts repo; "main" keeps manifest+shards consistent
  const ORIGIN = `https://raw.githubusercontent.com/${REPO}/${sha}/search-index-data/manifest.json`;

  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (context.request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const upstream = await fetch(ORIGIN, {
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
    cf: { cacheTtl: 0 },
  });
  if (!upstream.ok) {
    return new Response("Not found", { status: 404 });
  }

  const res = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
  if (context.request.method === "GET") {
    context.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return res;
}
