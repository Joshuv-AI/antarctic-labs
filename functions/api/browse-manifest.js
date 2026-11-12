// GET /api/browse-manifest
// Discovery document for the library page's browse streamer
// (2026-11-10 load-speed pack): which catalog fingerprint is
// current, its total, and the static browse-page layout baked by
// scripts/build-catalog-meta.mjs. Short edge cache: the pointer can
// flip on a metadata rebuild, and the client re-reads this once per
// page load. Dormant-safe like the search route: 503 until the
// metadata products exist.
//
// 2026-11-12 (Tail A): served through the Cache API with
// stale-while-revalidate — a cached copy is answered immediately
// and refreshed in the background, so most loads never run the
// upstream fetches at all. Previously every isolate re-fetched on
// a 60s pointer cycle with no fetch timeout, and under crawler
// saturation those invocations stalled into platform 504s.
import { catalogManifest } from "../_lib/catalog-search.js";

const json = (body, status = 200, cache = "public, max-age=60, stale-while-revalidate=300") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });

async function loadOut(env) {
  try {
    const out = await catalogManifest(env);
    if (out) return { out };
    return { status: 503, body: { error: "catalog metadata not built yet" } };
  } catch (err) {
    return { status: 500, body: { error: "browse manifest failed" } };
  }
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const key = new Request(request.url, { method: "GET" });
  const refresh = async () => {
    const r = await loadOut(env);
    if (!r.out) return json(r.body, r.status, "no-store");
    // The stored copy outlives the client-facing 60s so a hit can
    // always be served while the background refresh runs.
    await cache.put(key, json(r.out, 200, "public, max-age=300")).catch(() => {});
    return json(r.out);
  };
  const hit = await cache.match(key).catch(() => undefined);
  if (hit) {
    waitUntil(refresh());
    return hit;
  }
  return refresh();
}
