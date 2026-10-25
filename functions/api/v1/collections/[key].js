// GET /api/v1/collections/:collection?limit=&cursor=
// Placement on push: functions/api/v1/collections/[key].js
// Same bounded shard-sequential scan as search (catalog order, follow
// cursors until next_cursor is null). :collection is case-insensitive
// and must be one of PAPERS, DECLASSIFIED, BOOKS, REFERENCE, DOCUMENTS,
// PODCASTS.
import {
  jsonResponse,
  errorResponse,
  parseLimit,
  decodeCursor,
  listCollection,
} from "../../../_lib/tower-api.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return errorResponse(405, "method_not_allowed", "Only GET is supported");
  }
  const params = new URL(context.request.url).searchParams;
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
  const out = await listCollection(context.params.key || "", lim.limit, cursor);
  if (!out) {
    return errorResponse(
      502,
      "upstream_unavailable",
      "Catalog data is temporarily unavailable"
    );
  }
  if (out.error === "unknown_collection") {
    return errorResponse(404, "collection_not_found", "Unknown collection");
  }
  return jsonResponse({
    collection: String(context.params.key || "").toUpperCase(),
    results: out.results,
    next_cursor: out.next_cursor,
    exhausted: out.exhausted,
    scanned_shards: out.scanned_shards,
  });
}
