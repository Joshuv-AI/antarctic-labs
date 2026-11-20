// POST /api/catalog-hydrate  { indices: [ordinal, ...] }
// Selection-driven loading (2026-11-20): returns the catalog records
// for an explicit list of catalog ordinals, each tagged with its
// ordinal as _idx. The library page uses it to load curated / shelf /
// paper-axis scopes, whose membership exists client-side only as
// catalog-index bitsets. Callers block-pack their batches (ordinals
// spanning at most ~40 record blocks per request) so the invocation
// stays inside the platform subrequest budget — see
// _lib/catalog-search.js catalogHydrate. Deliberately separate from
// the keyed /api/v1 product, like /api/catalog-search.
import { catalogHydrate } from "../_lib/catalog-search.js";

const json = (body, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });

const MAX_INDICES = 2000;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const raw = body && Array.isArray(body.indices) ? body.indices : null;
  if (!raw) return json({ error: "indices array required" }, 400);
  if (raw.length > MAX_INDICES) {
    return json({ error: `at most ${MAX_INDICES} indices per request` }, 400);
  }
  const indices = [];
  for (const v of raw) {
    const n = typeof v === "number" ? v : Number.NaN;
    if (!Number.isInteger(n) || n < 0) {
      return json({ error: "indices must be non-negative integers" }, 400);
    }
    indices.push(n);
  }
  try {
    const out = await catalogHydrate(env, indices);
    if (out.notBuilt) {
      return json({ error: "catalog search index not built yet" }, 503);
    }
    return json(out);
  } catch {
    return json({ error: "catalog hydrate failed" }, 500);
  }
}
