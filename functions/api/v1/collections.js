// GET /api/v1/collections — collection counts + group keys (no works).
// Placement on push: functions/api/v1/collections.js
// The payload is precomputed into public/api-collections.json (a few KB)
// by scripts/build-api-collections.mjs from the hubs index; this endpoint
// never parses the ~14.5 MB hubs index itself (see tower-api.js).
import {
  jsonResponse,
  errorResponse,
  getApiCollections,
} from "../../_lib/tower-api.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return errorResponse(405, "method_not_allowed", "Only GET is supported");
  }
  const data = await getApiCollections();
  if (!data) {
    return errorResponse(
      502,
      "upstream_unavailable",
      "Catalog data is temporarily unavailable"
    );
  }
  return jsonResponse(data);
}
