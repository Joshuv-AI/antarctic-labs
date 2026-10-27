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
import { getRecordById } from "../../_lib/tower-catalog.js";
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
// Keyed path — the Phase 2 keyed search handler.
// Default mode searches the catalog (title + creator substring,
// case-insensitive; title matches rank before creator matches, then
// title A–Z) on the SAME bounded compact-index scan the keyless path
// uses (searchWorks in _lib/tower-api.js): at most a couple of compact
// index shards are parsed per step and the opaque cursor is walked
// internally until the page fills or the index is exhausted. Only the
// capped result page is hydrated to full records (getRecordById).
// The previous implementation parsed all 25 FULL catalog shards
// (descriptions included) per request and was killed by the Workers
// CPU limit in production (503 "error code: 1102" on every call).
// mode=fulltext additionally consults the deep-search index manifest;
// while that index is not live, the answer is the catalog result set
// plus a note saying so — never an error. Auth: Bearer key (any plan).
// Quota is charged ONLY after results are computed successfully: a
// search that fails upstream never bills the key.
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

// Catalog search on the bounded compact-index scan. Returns
// { total, results, truncated } or null when the catalog data cannot
// be read at all (the caller then answers 502 and charges no quota).
async function catalogSearch(q, limit) {
  const collected = [];
  let cursor = null;
  let exhausted = false;
  // 10 compact shards / ≤2 parsed per searchWorks step ⇒ ≤5 steps to
  // cover the index; the step cap is a hard bound, not an expectation.
  for (let step = 0; step < 10 && collected.length < limit; step++) {
    const out = await searchWorks({
      query: q,
      field: "any",
      limit: limit - collected.length,
      cursor,
    });
    if (!out) return null;
    if (out.error) break; // degenerate query (no terms): no matches
    collected.push(...out.results);
    exhausted = !!out.exhausted;
    if (!out.next_cursor) break;
    cursor = decodeCursor(out.next_cursor);
    if (!cursor) break;
  }
  // Hydrate only the capped page into the keyed result shape; a
  // record that cannot be hydrated still answers from the compact
  // projection (rights/download unknown rather than invented).
  const ql = q.toLowerCase();
  const ranked = [];
  for (const item of collected) {
    let rec = null;
    const got = await getRecordById(item.id).catch(() => null);
    if (got && got.state === "ok") rec = got.record;
    const out = recordOut(
      rec || {
        artifact_id: item.id,
        title: item.title,
        creator: item.creator,
        year: item.year,
        collection: item.collection,
        rights_status: null,
        download_url: null,
      }
    );
    const score = String(out.title || "").toLowerCase().includes(ql)
      ? 0
      : String(out.creator || "").toLowerCase().includes(ql)
        ? 1
        : 2;
    ranked.push({ out, score });
  }
  ranked.sort(
    (a, b) =>
      a.score - b.score ||
      String(a.out.title).localeCompare(String(b.out.title))
  );
  return {
    total: ranked.length,
    results: ranked.map((f) => f.out),
    truncated: collected.length >= limit && !exhausted,
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
  if (q.length > MAX_QUERY_LENGTH) {
    const stats = await usageStats(env, a.key);
    return json(
      { ok: false, error: `q must be at most ${MAX_QUERY_LENGTH} characters` },
      400,
      rateHeaders(stats)
    );
  }
  let limit = Number(url.searchParams.get("limit") || 20);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(100, Math.floor(limit));
  const mode = url.searchParams.get("mode") || "";

  // Compute FIRST, charge after success. The old order consumed quota
  // before the scan ran, so searches the platform killed mid-flight
  // (the 1102s) still billed the key. A failed search now costs
  // nothing; a successful one is charged exactly once, below.
  let payload;
  try {
    if (mode === "fulltext") {
      const ft = await fulltextSearch(q, limit).catch(() => null);
      if (ft) {
        payload = { ok: true, mode: "fulltext", count: ft.total, results: ft.results };
      } else {
        const cat = await catalogSearch(q, limit);
        if (!cat) {
          return json({ ok: false, error: "catalog data temporarily unavailable" }, 502);
        }
        payload = {
          ok: true,
          mode: "catalog",
          count: cat.total,
          results: cat.results,
          note: "full-text search activates when the deep-search index is live; returning catalog matches",
          ...(cat.truncated ? { truncated: true } : {}),
        };
      }
    } else {
      const cat = await catalogSearch(q, limit);
      if (!cat) {
        return json({ ok: false, error: "catalog data temporarily unavailable" }, 502);
      }
      payload = {
        ok: true,
        mode: "catalog",
        count: cat.total,
        results: cat.results,
        ...(cat.truncated ? { truncated: true } : {}),
      };
    }
  } catch (err) {
    console.error("keyed search failed", err);
    return json({ ok: false, error: "search failed" }, 502);
  }

  const quota = await consumeQuota(env, a.key);
  if (quota.error) {
    return json({ ok: false, error: "usage counter unavailable" }, 500);
  }
  if (!quota.ok) {
    return json(
      { ok: false, error: "daily limit exceeded", limit: quota.stats.limit, reset: quota.stats.reset },
      429,
      rateHeaders(quota.stats)
    );
  }
  return json(payload, 200, rateHeaders(quota.stats));
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
