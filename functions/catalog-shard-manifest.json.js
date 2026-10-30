// Serves /catalog-shard-manifest.json — the artifact_id -> shard index
// map the SPA fetches for entry lookups (src/lib/catalog.js). The file
// outgrew the Pages 25 MiB per-file static cap at ~1.18M catalog entries
// (~31.5 MB), so scripts/stage-deploy.mjs holds it out of dist/ and this
// function streams it from raw repo content instead — the same pattern
// as /catalog.json and /catalog-index.json. The data itself is still
// pushed to public/ by the publish pipeline exactly as before.

const SRC =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public/catalog-shard-manifest.json";

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (context.request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let upstream = null;
  try {
    upstream = await fetch(SRC, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
  } catch {
    upstream = null;
  }
  if (!upstream || !upstream.ok) {
    return new Response("Not found", { status: 404 });
  }

  // Stream the body through untouched: at ~31.5 MB the manifest must
  // never be buffered whole in the worker.
  const res = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
  if (context.request.method === "GET") {
    context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  }
  return res;
}
