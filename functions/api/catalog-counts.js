// GET /api/catalog-counts?collection=&bucket=&era=
// Published facet tallies for the library filter panel (2026-11-20
// correction): exact counts from the metadata build's counts file
// and facet postings — never record data, never derived from what
// a visitor's device happens to hold. With facet filters, each
// kind's tallies are computed within the selection defined by the
// OTHER kinds (see catalogCounts in _lib/catalog-search.js).
import { catalogCounts } from "../_lib/catalog-search.js";

const json = (body, status = 200, cache = "public, max-age=300") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const filters = {
    collection: url.searchParams.get("collection") || "",
    bucket: url.searchParams.get("bucket") || "",
    era: url.searchParams.get("era") || "",
  };
  try {
    const out = await catalogCounts(env, filters);
    if (out.notBuilt) {
      return json({ error: "catalog search index not built yet" }, 503, "no-store");
    }
    return json(out);
  } catch (err) {
    return json({ error: "catalog counts failed" }, 500, "no-store");
  }
}
