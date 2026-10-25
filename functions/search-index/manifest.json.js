// Serves /search-index/manifest.json — the deep-search manifest.
//
// R2 ROUTE (2026-10-25): the manifest now lives in the R2 bucket
// tower-search-index, published by the GitHub Actions build
// (.github/workflows/build-search-index.yml), and is read from the bucket's
// public custom domain. R2 has no 25 MiB Pages-file cap and no 100 MiB
// git per-file cap, which the git-hosted manifest was about to hit
// (~72 MiB at full catalog scale).
//
// FALLBACK: if R2 does not answer (bucket not yet enabled, domain not yet
// connected, or no Actions build has landed), the function falls back to
// the old texts-repo proxy (raw.githubusercontent.com/.../search-index-data),
// so deep search is no worse than today (404) until the first R2 build
// lands. The client requires manifest.docs to be a non-empty array and
// treats any failure as "unavailable", leaving title search untouched.
//
// The manifest at the R2 root is the LATEST build (overwritten per build);
// term shards are immutable per buildId, so a manifest/shard mismatch
// across a build boundary is impossible for a single manifest read.

const R2_BASE = "https://search-index.antarctic-labs.com";
const REPO = "Joshuv-AI/antarctic-labs-texts";

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (context.request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  // R2 first.
  let upstream = await fetch(`${R2_BASE}/manifest.json`, {
    cf: { cacheTtl: 300 },
  }).catch(() => null);
  // Fallback: texts repo (old path). Bypass upstream caches as before.
  if (!upstream || !upstream.ok) {
    upstream = await fetch(
      `https://raw.githubusercontent.com/${REPO}/main/search-index-data/manifest.json`,
      {
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
        cf: { cacheTtl: 0 },
      }
    ).catch(() => null);
  }
  if (!upstream || !upstream.ok) {
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
