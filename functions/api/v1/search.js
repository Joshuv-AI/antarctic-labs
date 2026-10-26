// GET /api/v1/search?q=...&field=title|author|any&limit=&cursor=
// Placement on push: functions/api/v1/search.js
// Search is a bounded shard-sequential scan (see tower-api.js): results
// are in catalog order, NOT relevance-ranked, and a page may be smaller
// than `limit` while next_cursor is present — clients must follow
// cursors until next_cursor is null (or exhausted is true) to cover
// more of the catalog. This is the price of staying inside the Workers
// CPU limit at 419k records; a global ranked search needs a precomputed
// term index, which is listed as a follow-up in REPORT.md, not faked
// here.
import {
  MAX_QUERY_LENGTH,
  jsonResponse,
  errorResponse,
  parseLimit,
  decodeCursor,
  searchWorks,
} from "../../_lib/tower-api.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return errorResponse(405, "method_not_allowed", "Only GET is supported");
  }
  const params = new URL(context.request.url).searchParams;
  const q = (params.get("q") || "").trim();
  if (!q) {
    return errorResponse(400, "missing_query", "Query parameter q is required");
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return errorResponse(
      400,
      "query_too_long",
      `q must be at most ${MAX_QUERY_LENGTH} characters`
    );
  }
  const field = params.get("field") || "any";
  if (!["title", "author", "any"].includes(field)) {
    return errorResponse(
      400,
      "invalid_field",
      "field must be one of: title, author, any"
    );
  }
  const lim = parseLimit(params);
  if (!lim.ok) return lim.error;
  let cursor = null;
  const cursorRaw = params.get("cursor");
  if (cursorRaw !== null) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      return errorResponse(400, "invalid_cursor", "cursor is not valid");
    }
  }
  const out = await searchWorks({ query: q, field, limit: lim.limit, cursor });
  if (!out || out.error) {
    return errorResponse(
      502,
      "upstream_unavailable",
      "Catalog data is temporarily unavailable"
    );
  }
  return jsonResponse({
    query: q,
    field: field === "any" ? "any" : field,
    results: out.results,
    next_cursor: out.next_cursor,
    exhausted: out.exhausted,
    scanned_shards: out.scanned_shards,
  });
}
