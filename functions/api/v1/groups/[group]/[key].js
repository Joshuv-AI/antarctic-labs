// GET /api/v1/groups/:group/:key?limit=&offset=
// Placement on push: functions/api/v1/groups/[group]/[key].js
// :group is traditions | programmes | authors | course. :key is the
// tradition/programme key, author slug, or course-group slug (see
// GET /api/v1/collections for the key lists). Works come from the
// precomputed hubs index — no catalog walk. Pagination here is
// offset-based because the group list is already in memory.
import {
  jsonResponse,
  errorResponse,
  parseLimit,
  parseOffset,
  getHubsIndex,
  groupWorks,
} from "../../../../_lib/tower-api.js";

const GROUPS = ["traditions", "programmes", "authors", "course"];

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return errorResponse(405, "method_not_allowed", "Only GET is supported");
  }
  const group = String(context.params.group || "").toLowerCase();
  if (!GROUPS.includes(group)) {
    return errorResponse(
      404,
      "group_not_found",
      "group must be one of: traditions, programmes, authors, course"
    );
  }
  const params = new URL(context.request.url).searchParams;
  const lim = parseLimit(params);
  if (!lim.ok) return lim.error;
  const off = parseOffset(params);
  if (!off.ok) return off.error;
  const hubs = await getHubsIndex();
  if (!hubs) {
    return errorResponse(
      502,
      "upstream_unavailable",
      "Catalog data is temporarily unavailable"
    );
  }
  const out = groupWorks(hubs, group, context.params.key || "");
  if (out.error) {
    return errorResponse(404, "group_key_not_found", "Unknown group key");
  }
  return jsonResponse({
    group,
    key: String(context.params.key || "").toLowerCase(),
    total: out.total,
    offset: off.offset,
    results: out.works.slice(off.offset, off.offset + lim.limit),
  });
}
