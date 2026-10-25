// GET /api/v1/collections — collection counts + group keys (no works).
// Placement on push: functions/api/v1/collections.js
// Counts come from the precomputed hubs index; this endpoint never
// walks the catalog. Note the hubs-index parse cost (see tower-api.js).
import {
  jsonResponse,
  errorResponse,
  getHubsIndex,
  slugify,
} from "../../_lib/tower-api.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return errorResponse(405, "method_not_allowed", "Only GET is supported");
  }
  const hubs = await getHubsIndex();
  if (!hubs) {
    return errorResponse(
      502,
      "upstream_unavailable",
      "Catalog data is temporarily unavailable"
    );
  }
  return jsonResponse({
    snapshot_date: hubs.snapshotDate || null,
    total: hubs.total ?? null,
    collections: hubs.collections || {},
    traditions: Object.keys(hubs.traditions || {}),
    programmes: Object.keys(hubs.programmes || {}),
    authors: (hubs.topAuthors || []).map((a) => ({
      name: a.name,
      slug: a.slug,
      count: a.count ?? null,
    })),
    course_groups: ((hubs.course && hubs.course.groups) || []).map((g) => ({
      label: g.label,
      slug: slugify(g.label),
      count: (g.items || []).length,
    })),
  });
}
