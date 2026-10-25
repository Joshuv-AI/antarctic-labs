// GET /api/v1/health — no data fetch, no catalog access.
// Placement on push: functions/api/v1/health.js
import { API_NAME, API_VERSION, jsonResponse } from "../../_lib/tower-api.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return jsonResponse(
      { error: { code: "method_not_allowed", message: "Only GET is supported" } },
      405
    );
  }
  return jsonResponse({
    status: "ok",
    api: API_NAME,
    version: API_VERSION,
    read_only: true,
    endpoints: [
      "GET /api/v1/health",
      "GET /api/v1/search?q=&field=&limit=&cursor=",
      "GET /api/v1/works/:id",
      "GET /api/v1/collections",
      "GET /api/v1/collections/:collection?limit=&cursor=",
      "GET /api/v1/groups/:group/:key?limit=&offset=",
    ],
  });
}
