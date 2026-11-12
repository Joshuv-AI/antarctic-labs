// GET /browse-pages/<fingerprint>/<page>
// Immutable proxy for the static browse pages baked by
// scripts/build-catalog-meta.mjs into R2 under meta/<fingerprint>/
// browse/ (2026-11-10 load-speed pack). The pages are addressed by
// the catalog fingerprint, so their bytes can never change: the
// response carries a one-year immutable cache header and the fetch
// asks the edge to cache it for a year too — after the first hit in
// a location this is a pure edge serve with no function work beyond
// the proxy and no origin round trip. Keeping the route same-origin
// also avoids any CORS surface on the storage domain. A page that
// does not exist upstream (fingerprint predates the pack, bad page
// number) is a clean 404, which the client's streamer reads as
// "fall back to the search endpoint for this page".
const BASE = "https://search-index.antarctic-labs.com";

export async function onRequestGet(context) {
  const { params, waitUntil } = context;
  const fp = String(params.fingerprint || "");
  const page = String(params.page || "");
  // orders.bin (2026-11-10): the baked sort-order permutations live
  // beside the browse pages under the same fingerprint and ride this
  // proxy — same immutability contract, binary content type.
  const isOrders = page === "orders.bin";
  if (!/^[a-f0-9]{64}$/.test(fp) || (!isOrders && !/^page-\d{4}\.json$/.test(page))) {
    return new Response(JSON.stringify({ error: "bad browse page address" }), {
      status: 400,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  // Edge-cache the response through the Cache API (2026-11-11 error
  // investigation): a Pages Function response is served DYNAMIC — the
  // immutable Cache-Control header alone never populates the edge cache,
  // so every library load from every visitor re-executed this function
  // and re-fetched from R2 (128 pages per full catalog load). The
  // content is addressed by the catalog fingerprint and can never
  // change, so a colo cache fill is permanent in practice.
  const cache =
    typeof caches !== "undefined" && caches.default ? caches.default : null;
  const cacheKey = new Request(
    `https://antarctic-labs.com/browse-pages/${fp}/${page}`,
    { method: "GET" }
  );
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => null);
    if (hit) return hit;
  }
  const upstream = await fetch(
    isOrders ? `${BASE}/meta/${fp}/orders.bin` : `${BASE}/meta/${fp}/browse/${page}`,
    { cf: { cacheTtl: 31536000, cacheEverything: true } }
  ).catch(() => null);
  if (!upstream || !upstream.ok) {
    return new Response(JSON.stringify({ error: "no such browse page" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  const res = new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": isOrders ? "application/octet-stream" : "application/json",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
  if (cache) {
    const put = cache.put(cacheKey, res.clone()).catch(() => {});
    if (typeof waitUntil === "function") waitUntil(put);
  }
  return res;
}
