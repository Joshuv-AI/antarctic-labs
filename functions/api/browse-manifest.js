// GET /api/browse-manifest
// Discovery document for the library page's browse streamer
// (2026-11-10 load-speed pack): which catalog fingerprint is
// current, its total, and the static browse-page layout baked by
// scripts/build-catalog-meta.mjs. Short edge cache: the pointer can
// flip on a metadata rebuild, and the client re-reads this once per
// page load. Dormant-safe like the search route: 503 until the
// metadata products exist.
import { catalogManifest } from "../_lib/catalog-search.js";

const json = (body, status = 200, cache = "public, max-age=60") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });

export async function onRequestGet({ env }) {
  try {
    const out = await catalogManifest(env);
    if (!out) {
      return json({ error: "catalog metadata not built yet" }, 503, "no-store");
    }
    return json(out);
  } catch (err) {
    return json({ error: "browse manifest failed" }, 500, "no-store");
  }
}
