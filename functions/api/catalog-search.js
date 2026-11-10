// GET /api/catalog-search?q=&collection=&bucket=&format=&cursor=
// Phase B server-side catalog search + browse (see _lib/catalog-search.js).
// Deliberately separate from /api/v1/search (the keyed API product):
// this serves the library page. Dormant-safe: 503 until the metadata
// products exist in R2.
import { catalogSearch } from "../_lib/catalog-search.js";

const json = (body, status = 200, cache = "public, max-age=300") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").slice(0, 200);
  const cursorRaw = Number.parseInt(url.searchParams.get("cursor") || "0", 10);
  const cursor = Number.isFinite(cursorRaw) && cursorRaw > 0 ? cursorRaw : 0;
  const filters = {
    collection: url.searchParams.get("collection") || "",
    bucket: url.searchParams.get("bucket") || "",
    format: url.searchParams.get("format") || "",
  };
  // Page size: search keeps the long-standing 25. Browse streaming
  // (2026-11-09) passes pagesize to pull the catalog in big pages —
  // consecutive ids hydrate from a single record block, so a big page
  // costs the function no extra subrequests. Raised 500 -> 2000 on
  // 2026-11-10 (load-speed fix): the pipelined streamer pulls
  // 2000-record pages, 4x fewer requests to stream the catalog.
  const pageSizeRaw = Number.parseInt(url.searchParams.get("pagesize") || "25", 10);
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.min(2000, Math.max(25, pageSizeRaw))
    : 25;
  try {
    const out = await catalogSearch(env, { q, filters, cursor, pageSize });
    if (out.notBuilt) {
      return json({ error: "catalog search index not built yet" }, 503, "no-store");
    }
    return json(out);
  } catch (err) {
    return json({ error: "catalog search failed" }, 500, "no-store");
  }
}
