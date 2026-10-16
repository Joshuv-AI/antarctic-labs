// Serves /catalog.json — the full Tower of Babel catalog (~62 MiB at
// 83,653 entries), which exceeds the 25 MiB per-file limit for static
// Cloudflare Pages files. The build holds it out of dist/
// (scripts/stage-deploy.mjs); this function proxies it from the git
// repo's raw content with a short edge-cache TTL so new pushes show up
// within minutes.

const ORIGIN =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public/catalog.json";

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (context.request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const upstream = await fetch(ORIGIN, {
    cf: { cacheTtl: 300, cacheEverything: true },
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
