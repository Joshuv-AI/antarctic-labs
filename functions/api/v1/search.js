// GET /api/v1/search — ONE endpoint, two documented modes (merged
// 2026-10-26 on Joshua's decision):
//
//   * NO Authorization header → the legacy keyless agent search,
//     unchanged byte-for-byte: bounded shard-sequential scan over the
//     compact catalog index (see _lib/tower-api.js), results in
//     catalog order with opaque cursor pagination. It never touches
//     D1 and never requires a key.
//
//   * Authorization: Bearer <key> → the keyed API search: the key is
//     authenticated against D1 (functions/_lib/api-auth.js), the call
//     counts against the key's daily quota with X-RateLimit-* headers,
//     results are ranked catalog matches, and ?mode=fulltext answers
//     from the deep-search index once it is live (degrading to catalog
//     results plus a note until then). A presented-but-invalid key
//     errors (401/403) — it NEVER silently falls back to keyless.
import {
  MAX_QUERY_LENGTH,
  jsonResponse,
  errorResponse,
  parseLimit,
  decodeCursor,
  searchWorks,
} from "../../_lib/tower-api.js";
import {
  json,
  authenticate,
  consumeQuota,
  usageStats,
  rateHeaders,
} from "../../_lib/api-auth.js";
import {
  getShardRecords,
  SHARD_COUNT,
  getRecordById,
} from "../../_lib/tower-catalog.js";
import { shardFor, stem } from "../../_lib/search-text-lite.js";

// ---------------------------------------------------------------------
// Keyless path — the original legacy handler, verbatim behavior.
// Search is a bounded shard-sequential scan (see tower-api.js): results
// are in catalog order, NOT relevance-ranked, and a page may be smaller
// than `limit` while next_cursor is present — clients must follow
// cursors until next_cursor is null (or exhausted is true) to cover
// more of the catalog. This is the price of staying inside the Workers
// CPU limit at 419k records; a global ranked search needs a precomputed
// term index, which is listed as a follow-up in REPORT.md, not faked
// here.
// ---------------------------------------------------------------------
async function legacySearch(context) {
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

// ---------------------------------------------------------------------
// Keyed path — the Phase 2 keyed search handler, verbatim behavior.
// Default mode searches the catalog (title + creator substring,
// case-insensitive; title matches rank before creator matches, then
// title A–Z) using the same shard access as the entry pages
// (functions/_lib/tower-catalog.js). mode=fulltext additionally
// consults the deep-search index manifest; while that index is not
// live, the answer is the catalog result set plus a note saying so —
// never an error. Auth: Bearer key (any plan). Consumes one unit of
// daily quota.
// ---------------------------------------------------------------------
const SITE = "https://antarctic-labs.com";

function recordOut(r) {
  return {
    artifact_id: r.artifact_id,
    title: r.title,
    creator: r.creator || "",
    year: r.year ?? null,
    collection: r.collection,
    rights_status: r.rights_status,
    download_url: r.download_url || null,
  };
}

async function catalogSearch(q, limit) {
  const ql = q.toLowerCase();
  const found = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    const records = await getShardRecords(i).catch(() => null);
    if (!records) continue;
    for (const r of records) {
      if (!r || !r.title) continue;
      const t = r.title.toLowerCase();
      const c = (r.creator || "").toLowerCase();
      if (t.includes(ql)) found.push({ r, score: 0 });
      else if (c.includes(ql)) found.push({ r, score: 1 });
    }
    if (found.length >= 1000) break;
  }
  found.sort(
    (a, b) =>
      a.score - b.score ||
      String(a.r.title).localeCompare(String(b.r.title))
  );
  return {
    total: found.length,
    results: found.slice(0, limit).map((f) => recordOut(f.r)),
  };
}

async function fulltextSearch(q, limit) {
  let manifest = null;
  try {
    const res = await fetch(`${SITE}/search-index/manifest.json`);
    if (res.ok) manifest = await res.json();
  } catch {
    manifest = null;
  }
  if (
    !manifest ||
    !Array.isArray(manifest.docs) ||
    manifest.docs.length === 0 ||
    !manifest.buildId
  ) {
    return null; // index not live
  }
  const shards = manifest.shards || 64;
  const terms = [
    ...new Set(
      (q.toLowerCase().match(/[a-z0-9]+/g) || [])
        .filter((t) => t.length >= 2)
        .map((t) => stem(t))
    ),
  ];
  if (terms.length === 0) return { total: 0, results: [] };
  const shardIdxs = [...new Set(terms.map((s) => shardFor(s, shards)))];
  const scores = new Map();
  await Promise.all(
    shardIdxs.map(async (idx) => {
      try {
        const res = await fetch(
          `${SITE}/search-index/${manifest.buildId}/terms/${idx}.json`
        );
        if (!res.ok) return;
        const postings = await res.json();
        for (const s of terms) {
          if (shardFor(s, shards) !== idx) continue;
          for (const [docIdx, count] of postings[s] || []) {
            scores.set(docIdx, (scores.get(docIdx) || 0) + count);
          }
        }
      } catch {
        /* a missing shard simply contributes nothing */
      }
    })
  );
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  const results = [];
  for (const [docIdx, hits] of ranked) {
    const doc = manifest.docs[docIdx];
    if (!doc) continue;
    let rights_status = null;
    let download_url = doc.file || null;
    const rec = await getRecordById(doc.id).catch(() => null);
    if (rec && rec.state === "ok") {
      rights_status = rec.record.rights_status;
      download_url = rec.record.download_url || download_url;
    }
    results.push({
      artifact_id: doc.id,
      title: doc.title,
      creator: doc.creator || "",
      year: doc.year ?? null,
      collection: doc.collection,
      rights_status,
      download_url,
      hits,
    });
  }
  return { total: scores.size, results };
}

async function keyedSearch(context) {
  const { request, env } = context;
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const a = await authenticate(request, env);
  if (a.response) return a.response;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) {
    const stats = await usageStats(env, a.key);
    return json({ ok: false, error: "q is required" }, 400, rateHeaders(stats));
  }
  let limit = Number(url.searchParams.get("limit") || 20);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(100, Math.floor(limit));
  const mode = url.searchParams.get("mode") || "";

  const quota = await consumeQuota(env, a.key);
  if (!quota.ok) {
    return json(
      { ok: false, error: "daily limit exceeded", limit: quota.stats.limit, reset: quota.stats.reset },
      429,
      rateHeaders(quota.stats)
    );
  }
  const headers = rateHeaders(quota.stats);

  if (mode === "fulltext") {
    const ft = await fulltextSearch(q, limit).catch(() => null);
    if (ft) {
      return json({ ok: true, mode: "fulltext", count: ft.total, results: ft.results }, 200, headers);
    }
    const cat = await catalogSearch(q, limit);
    return json(
      {
        ok: true,
        mode: "catalog",
        count: cat.total,
        results: cat.results,
        note: "full-text search activates when the deep-search index is live; returning catalog matches",
      },
      200,
      headers
    );
  }

  const cat = await catalogSearch(q, limit);
  return json(
    { ok: true, mode: "catalog", count: cat.total, results: cat.results },
    200,
    headers
  );
}

// Dispatch: the mere presence of an Authorization header selects the
// keyed path (a bad key must error loudly, never downgrade to
// keyless); its absence keeps the legacy keyless behavior exactly.
export async function onRequest(context) {
  if (context.request.headers.get("Authorization") !== null) {
    return keyedSearch(context);
  }
  return legacySearch(context);
}
