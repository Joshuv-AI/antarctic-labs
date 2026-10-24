// Serves /tower-popular.json — the Tower of Babel "Most Popular" ranking.
//
//   { "generated_at": "<iso>", "window_days": 30,
//     "items": [ { "artifact_id": "...", "views": 12 }, ... ] }
//
// Source: PostHog (project 684462, "Antarctic Labs"). One HogQL query
// against the Query API counts `work_viewed` events — the event the SPA
// fires once per work per session, carrying the work's artifact_id —
// grouped by artifact_id over the last 30 days, most viewed first.
//
// Why server-side: reading PostHog requires a *personal* API key, which
// must never ship to the browser (the phc_ key in src/lib/analytics.js is
// write-only capture). The key lives in the Pages secret POSTHOG_API_KEY
// (personal API key, `query:read` scope only, restricted to this project).
// Optional overrides: POSTHOG_PROJECT_ID, POSTHOG_QUERY_HOST.
//
// Failure contract: this endpoint NEVER errors the page. No key, PostHog
// unreachable, a bad response, or simply no views yet all answer 200 with
// { "items": [] } — the client then renders no Most Popular section and
// the Featured rails below it stay exactly as they were.
//
// Caching: a successful ranking is edge-cached for 1 hour (one PostHog
// query per hour per edge location is plenty for a popularity row, and
// stays far inside the free tier). Fallback/empty answers are not put in
// the edge cache and carry a short TTL, so the section appears soon after
// the key is configured or the first real views land.

const DEFAULT_PROJECT_ID = "684462";
const DEFAULT_QUERY_HOST = "https://us.posthog.com";
const WINDOW_DAYS = 30;
const LIMIT = 24;
const SUCCESS_TTL_SECONDS = 3600;
const FALLBACK_TTL_SECONDS = 120;

const HOGQL = [
  "SELECT properties.artifact_id AS artifact_id, count() AS views",
  "FROM events",
  "WHERE event = 'work_viewed'",
  `AND timestamp >= now() - INTERVAL ${WINDOW_DAYS} DAY`,
  "AND properties.artifact_id IS NOT NULL",
  "AND properties.artifact_id != ''",
  "GROUP BY artifact_id",
  "ORDER BY views DESC, artifact_id ASC",
  `LIMIT ${LIMIT}`,
].join(" ");

function payload(items) {
  return {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    items,
  };
}

function jsonResponse(body, ttlSeconds) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${ttlSeconds}`,
    },
  });
}

const idOk = (v) =>
  typeof v === "string" &&
  v.length >= 1 &&
  v.length <= 300 &&
  !/[\s/\\"'<>]/.test(v);

async function queryPostHog(env) {
  const key = env.POSTHOG_API_KEY;
  if (!key) return null;
  const projectId = String(env.POSTHOG_PROJECT_ID || DEFAULT_PROJECT_ID);
  const host = String(env.POSTHOG_QUERY_HOST || DEFAULT_QUERY_HOST).replace(
    /\/+$/,
    ""
  );
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let res;
  try {
    res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query: HOGQL },
        name: "tower-most-popular",
      }),
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!res || !res.ok) return null;
  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const columns = Array.isArray(data && data.columns) ? data.columns : [];
  const idIdx = columns.indexOf("artifact_id");
  const viewIdx = columns.indexOf("views");
  const rows = Array.isArray(data && data.results) ? data.results : [];
  if (idIdx < 0 || viewIdx < 0 || rows.length === 0) return [];
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const artifact_id = row[idIdx];
    const views = Number(row[viewIdx]);
    if (!idOk(artifact_id) || seen.has(artifact_id)) continue;
    if (!Number.isFinite(views) || views <= 0) continue;
    seen.add(artifact_id);
    items.push({ artifact_id, views: Math.floor(views) });
    if (items.length >= LIMIT) break;
  }
  return items;
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let items = null;
  try {
    items = await queryPostHog(context.env || {});
  } catch {
    items = null;
  }
  if (!items || items.length === 0) {
    // Not configured yet, PostHog down, or no views recorded — the
    // client hides the section. Short TTL only, never edge-cached, so
    // recovery is quick once data or the key exists.
    return jsonResponse(payload([]), FALLBACK_TTL_SECONDS);
  }
  const res = jsonResponse(payload(items), SUCCESS_TTL_SECONDS);
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
