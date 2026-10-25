// GET /api/v1/works/:id — one work's metadata by artifact id.
// Placement on push: functions/api/v1/works/[id].js
// Lookup is manifest -> one catalog shard (tower-catalog.js pattern).
import {
  jsonResponse,
  errorResponse,
  getWork,
} from "../../../_lib/tower-api.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return errorResponse(405, "method_not_allowed", "Only GET is supported");
  }
  const id = context.params.id || "";
  const res = await getWork(id);
  if (res.state === "invalid" || res.state === "missing") {
    return errorResponse(404, "work_not_found", "No work with that id");
  }
  if (res.state !== "ok") {
    return errorResponse(
      502,
      "upstream_unavailable",
      "Catalog data is temporarily unavailable"
    );
  }
  return jsonResponse({ work: res.work });
}
