// Tower of Babel — public read-only API, shared library (lane C, 2026-10-24).
//
// Placement on push (parent decides): this file goes to
//   functions/_lib/tower-api.js
// in the site repo, next to functions/_lib/tower-catalog.js, which it
// imports. Endpoint files live under functions/api/v1/ and import this
// module as ../../_lib/tower-api.js; functions/mcp.js imports it as
// ./_lib/tower-api.js. Nothing here is a route by itself.
//
// READ-ONLY BY CONSTRUCTION: every function below only GETs public data
// the site already publishes. There is no write path, no auth, no key,
// no cookie, no user data of any kind. Error responses are generic on
// purpose: they never include internal URLs, file paths, stack traces,
// or upstream error text.
//
// CPU SAFETY (the binding constraint at ~419k records; the 2026-10-24
// hub-page 1102s were full-catalog walks with per-record regex):
//   - getWork: manifest lookup -> ONE catalog shard fetch (the exact
//     tower-catalog.js pattern). Never scans.
//   - search / list-by-collection: shard-sequential scan over the
//     COMPACT catalog-index shards (public/catalog-index-shards, 10
//     shards, the same projection the SPA's Stage 2 index uses), at
//     most MAX_SHARDS_PER_REQUEST shards per request, stopping as soon
//     as the page fills. Continuation is an opaque cursor, not a
//     re-scan: a client that follows cursors walks the catalog in
//     bounded steps and never asks one request to do a full walk.
//   - list-by-group: ONE fetch of the precomputed
//     public/tower-hubs-index.json (edge-cached 1h) and a slice of one
//     group's already-computed work list. No walk, no regex.
//   - Nothing here parses the 25 full catalog shards per request.
// KNOWN COST, STATED PLAINLY: parsing the 14.5 MB hubs index is the
// heaviest single operation in this module (groups + collections
// endpoints). It is edge-cached and it is one parse, not a walk, but
// the honest long-term fix is to split the hubs index into per-group
// files at push time (same sidecar pattern as tower-descriptions/);
// see REPORT.md "known limits". Do not "fix" it by reintroducing a
// per-request catalog walk.

import {
  SITE,
  fetchJsonCached,
  getRecordById,
  getDescriptionOverride,
  textFileUrl,
  entryUrl,
  hubsIndexUrl,
} from "./tower-catalog.js";

export const API_VERSION = "1.0.0";
export const API_NAME = "tower-of-babel";

// The six collections the catalog actually uses (OAI's list, uppercase).
export const COLLECTIONS = [
  "PAPERS",
  "DECLASSIFIED",
  "BOOKS",
  "REFERENCE",
  "DOCUMENTS",
  "PODCASTS",
];

// Compact index shards (SPA Stage 2 projection), NOT the 25 full shards.
export const INDEX_SHARD_COUNT = 10;
const INDEX_RAW =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public/catalog-index-shards";
export const indexShardUrl = (i) =>
  `${INDEX_RAW}/catalog-index-${String(i).padStart(2, "0")}.json`;

export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;
export const MAX_SHARDS_PER_REQUEST = 2;
export const MAX_QUERY_LENGTH = 200;

// --- HTTP helpers ---------------------------------------------------------

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Data changes only on data pushes; 1h edge cache matches the
      // catalog functions' contract. Errors are not cached.
      "Cache-Control":
        status === 200
          ? "public, max-age=3600"
          : "no-store",
    },
  });
}

// Generic errors only. `detail` is a caller-supplied safe string, never
// an upstream error, a URL, or a path.
export function errorResponse(status, code, detail) {
  return jsonResponse({ error: { code, message: detail } }, status);
}

export function parseLimit(searchParams) {
  const raw = searchParams.get("limit");
  if (raw === null) return { ok: true, limit: DEFAULT_LIMIT };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    return {
      ok: false,
      error: errorResponse(
        400,
        "invalid_limit",
        `limit must be an integer between 1 and ${MAX_LIMIT}`
      ),
    };
  }
  return { ok: true, limit: n };
}

export function parseOffset(searchParams) {
  const raw = searchParams.get("offset");
  if (raw === null) return { ok: true, offset: 0 };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    return {
      ok: false,
      error: errorResponse(
        400,
        "invalid_offset",
        "offset must be a non-negative integer"
      ),
    };
  }
  return { ok: true, offset: n };
}

// Opaque cursor: { s: shard index, i: record index within that shard }.
// Encoded base64url so clients cannot (and need not) construct one.
// Invalid cursors are a 400, never a crash.
export function encodeCursor(shard, index) {
  const raw = JSON.stringify({ s: shard, i: index });
  const bytes = new TextEncoder().encode(raw);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(cursor) {
  try {
    const norm = String(cursor).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !Number.isInteger(obj.s) ||
      obj.s < 0 ||
      obj.s >= INDEX_SHARD_COUNT ||
      !Number.isInteger(obj.i) ||
      obj.i < 0
    ) {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

// --- Record normalization (public fields only) ----------------------------

function normText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function publicIndexRecord(r) {
  return {
    id: r.artifact_id || r.id || null,
    title: r.title || null,
    creator: r.creator || null,
    year: r.year ?? null,
    collection: r.collection || null,
    entry_url: r.artifact_id || r.id ? entryUrl(r.artifact_id || r.id) : null,
  };
}

async function publicFullRecord(record) {
  const id = record.artifact_id;
  const override = await getDescriptionOverride(id);
  return {
    id,
    title: record.title || null,
    creator: record.creator || null,
    year: record.year ?? null,
    collection: record.collection || null,
    description: override || record.description || null,
    source: record.source || null,
    source_url: record.source_url || null,
    rights_status: record.rights_status || null,
    license: record.license || null,
    format: record.format || null,
    file_size: record.file_size || null,
    entry_url: entryUrl(id),
    // The URL the record itself carries, or null. This is NOT a claim
    // that the file is currently available: download_status is
    // deliberately not exposed (the catalog's download_status field is
    // stale and is not reliable proof of anything).
    text_url: textFileUrl(record),
  };
}

// --- Compact index shard access (last-shard memo, same pattern as
// tower-catalog.js getShardRecords) ----------------------------------------

let indexMemoIdx = -1;
let indexMemoRecords = null;

export async function getIndexShard(i) {
  if (indexMemoIdx === i && indexMemoRecords) return indexMemoRecords;
  const data = await fetchJsonCached(indexShardUrl(i), 3600);
  const records = Array.isArray(data) ? data : null;
  if (records) {
    indexMemoIdx = i;
    indexMemoRecords = records;
  }
  return records;
}

// --- Search / list-by-collection (bounded shard-sequential scan) ----------

// Query parsing (2026-10-27, keyless 1102 fix): a double-quoted span
// is a PHRASE — its normalized text must appear as one contiguous
// substring of the field haystack. Text outside quotes keeps the
// original per-term substring semantics exactly. Before this, a quoted
// query was split on whitespace WITH the quote characters attached,
// so a phrase term could never match any record: the scan still
// walked its shard budget, and in production the request died on the
// Workers resource limit (503 "error code: 1102", live-probed 3/3 on
// "survival of the fittest") instead of answering. Phrases make the
// predicate SELECTIVE, so the same bounded scan now answers them.
// Only balanced quotes with non-empty content form a phrase; anything
// else (unbalanced quote, empty span) falls back to the legacy term
// split verbatim, so every non-phrase query behaves byte-identically.
function parseSearchQuery(query) {
  const norm = normText(query);
  const phrases = [];
  const rest = norm.replace(/"([^"]*)"/g, (whole, inner) => {
    const p = inner.trim().replace(/\s+/g, " ");
    if (p) phrases.push(p);
    return " ";
  });
  const terms = rest.split(/\s+/).filter(Boolean);
  if (terms.length === 0 && phrases.length === 0) {
    // Degenerate input (e.g. q='""'): preserve the legacy derivation
    // so behavior (an empty 200 page) is unchanged.
    return { terms: norm.split(/\s+/).filter(Boolean), phrases: [] };
  }
  return { terms, phrases };
}

function matches(record, terms, phrases, field) {
  const hayTitle = normText(record.title);
  const hayCreator = normText(record.creator);
  const inField = (needle) =>
    field === "title"
      ? hayTitle.includes(needle)
      : field === "author"
        ? hayCreator.includes(needle)
        : hayTitle.includes(needle) || hayCreator.includes(needle);
  return terms.every(inField) && phrases.every(inField);
}

// predicate: (record) => boolean. Returns page + opaque next cursor, or
// null when the scan cannot start (upstream fetch failure).
// The scan visits at most MAX_SHARDS_PER_REQUEST shards and stops as
// soon as the page fills, so one request never walks the catalog.
export async function scanIndex(predicate, limit, cursor) {
  let shard = cursor ? cursor.s : 0;
  let index = cursor ? cursor.i : 0;
  const results = [];
  let scannedShards = 0;
  let exhausted = false;
  while (results.length < limit && shard < INDEX_SHARD_COUNT) {
    if (scannedShards >= MAX_SHARDS_PER_REQUEST && results.length === 0) {
      // No page yet, but the per-request shard budget is spent: hand
      // the caller a cursor so it can continue without re-scanning.
      // (When results exist we stop here regardless — see below.)
      break;
    }
    if (scannedShards >= MAX_SHARDS_PER_REQUEST) break;
    const records = await getIndexShard(shard);
    if (!records) return null;
    scannedShards += 1;
    for (; index < records.length && results.length < limit; index += 1) {
      const r = records[index];
      if (r && predicate(r)) results.push(publicIndexRecord(r));
    }
    if (results.length >= limit) {
      // Page filled mid-shard: cursor resumes inside this shard.
      if (index < records.length) {
        return { results, next_cursor: encodeCursor(shard, index), scanned_shards: scannedShards, exhausted: false };
      }
      // Page filled exactly at a shard boundary: resume at next shard.
      shard += 1;
      index = 0;
      if (shard >= INDEX_SHARD_COUNT) {
        return { results, next_cursor: null, scanned_shards: scannedShards, exhausted: true };
      }
      return { results, next_cursor: encodeCursor(shard, 0), scanned_shards: scannedShards, exhausted: false };
    }
    shard += 1;
    index = 0;
  }
  if (shard >= INDEX_SHARD_COUNT) exhausted = true;
  return {
    results,
    next_cursor: exhausted ? null : encodeCursor(shard, index),
    scanned_shards: scannedShards,
    exhausted,
  };
}

export async function searchWorks({ query, field, limit, cursor }) {
  const { terms, phrases } = parseSearchQuery(query);
  if (terms.length === 0 && phrases.length === 0) {
    return { error: "empty_query" };
  }
  const f = field === "title" || field === "author" ? field : "any";
  return scanIndex((r) => matches(r, terms, phrases, f), limit, cursor);
}

export async function listCollection(collection, limit, cursor) {
  const coll = String(collection).toUpperCase();
  if (!COLLECTIONS.includes(coll)) return { error: "unknown_collection" };
  return scanIndex((r) => r.collection === coll, limit, cursor);
}

// --- Hubs index (precomputed groups) --------------------------------------

let hubsMemo = null;
let hubsMemoAt = 0;
const HUBS_MEMO_TTL_MS = 3600 * 1000;

export async function getHubsIndex() {
  if (hubsMemo && Date.now() - hubsMemoAt < HUBS_MEMO_TTL_MS) return hubsMemo;
  const data = await fetchJsonCached(hubsIndexUrl, 3600);
  if (data && typeof data === "object") {
    hubsMemo = data;
    hubsMemoAt = Date.now();
  }
  return data;
}

export function slugify(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Groups the API exposes, matching the hubs index structure:
// traditions: dict key -> work list; programmes: dict key -> work list;
// authors: list of {name, slug, count, works}; course: {groups: [{label,
// items}], courseCount}. Returns { works, total } or { error }.
export function groupWorks(hubs, group, key) {
  const k = String(key ?? "").toLowerCase();
  if (group === "traditions") {
    const list = hubs.traditions && hubs.traditions[k];
    if (!Array.isArray(list)) return { error: "unknown_group_key" };
    return { works: list, total: list.length };
  }
  if (group === "programmes") {
    const list = hubs.programmes && hubs.programmes[k];
    if (!Array.isArray(list)) return { error: "unknown_group_key" };
    return { works: list, total: list.length };
  }
  if (group === "authors") {
    const author = (hubs.topAuthors || []).find((a) => a.slug === k);
    if (!author) return { error: "unknown_group_key" };
    return { works: author.works || [], total: author.count ?? (author.works || []).length };
  }
  if (group === "course") {
    const g = (hubs.course && hubs.course.groups ? hubs.course.groups : []).find(
      (x) => slugify(x.label) === k
    );
    if (!g) return { error: "unknown_group_key" };
    return { works: g.items || [], total: (g.items || []).length };
  }
  return { error: "unknown_group" };
}

// --- getWork ---------------------------------------------------------------

export async function getWork(id) {
  const clean = String(id || "").trim();
  if (!clean || clean.length > 200 || /[\s/\\]/.test(clean)) {
    return { state: "invalid" };
  }
  const res = await getRecordById(clean);
  if (res.state === "missing") return { state: "missing" };
  if (res.state !== "ok" || !res.record) return { state: "error" };
  return { state: "ok", work: await publicFullRecord(res.record) };
}

export { SITE };
