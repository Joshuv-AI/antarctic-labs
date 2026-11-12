// Serves one Stage 2 index chunk: /catalog-index2/<version>/<i>.json
//
// The version segment is a cache-buster only (its value is not checked):
// the body is catalog index shard <i> from main, proxied through the edge
// cache and returned with immutable caching — a versioned URL's content
// never changes, so browsers may keep it for a year. New data produces a
// new version (see ../manifest.json.js) and therefore new URLs; the old
// ones simply stop being referenced.
//
// SHARD_COUNT must match the number of catalog-index shards in the repo.
// Keep in sync with functions/catalog-index.json.js and
// functions/catalog-index2/manifest.json.js.

const SHARD_COUNT = 10;
const RAW =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public/catalog-index-shards";

export async function onRequest(context) {
  const seg = String(context.params.index || "").replace(/\.json$/, "");
  const i = Number(seg);
  if (!Number.isInteger(i) || i < 0 || i >= SHARD_COUNT) {
    return new Response("Not found", { status: 404 });
  }
  // Edge-cache through the Cache API (2026-11-11 error investigation):
  // a Pages Function response is served DYNAMIC — the immutable header
  // alone never populates the edge cache, so every visitor's index load
  // re-executed this function and re-fetched the shard from GitHub. The
  // version segment is part of the request URL, so it keys the cache:
  // new data means new URLs and therefore new fills, exactly as the
  // header contract already promised browsers.
  const cache =
    typeof caches !== "undefined" && caches.default ? caches.default : null;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => null);
    if (hit) return hit;
  }
  const url = `${RAW}/catalog-index-${String(i).padStart(2, "0")}.json`;
  let r;
  try {
    r = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!r.ok) return new Response("Not found", { status: 404 });
  const res = new Response(r.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  if (cache) {
    const put = cache.put(cacheKey, res.clone()).catch(() => {});
    if (typeof context.waitUntil === "function") context.waitUntil(put);
  }
  return res;
}
