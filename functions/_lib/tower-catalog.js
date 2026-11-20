// Shared data access for the Tower of Babel crawler-facing functions
// (sitemap index, entry sitemaps, server-rendered entry pages).
//
// Data source: exactly the one functions/catalog.json.js already uses —
// the catalog shards on the repo's main branch via raw.githubusercontent,
// fetched with an edge cache TTL. The sitemap/entry layer therefore has
// the same freshness contract as the live /catalog.json: data-only pushes
// to main show up here within the cache TTL, no site rebuild required.
// (raw.githubusercontent is CDN-cached; that exposure is the one the live
// catalog function already accepts for this read-only display data. It is
// never used as a write/merge input.)
//
// The live shard count comes from public/catalog-shards/count.json,
// which the publish pipeline rewrites in the same commit as the shards
// (reshard auto-sizes N since 2026-10-30) — getShardCount() below reads
// it. SHARD_COUNT here is only the fallback for when that fetch fails,
// and it must stay >= the live count: a stale-low value silently drops
// most of the catalog from every consumer that loops `i < SHARD_COUNT`
// — diagnosed 2026-10-24 on the hub pages, /catalog.json, OAI and the
// sitemap. (Fallback 72 since 2026-10-30; count.json said 71 for the
// ~1.18M-entry catalog. Was 35 as an exact count before auto-sizing.)

export const SITE = "https://antarctic-labs.com";
export const SHARD_COUNT = 72;

export const RAW =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public";

export const hubsIndexUrl = `${RAW}/tower-hubs-index.json`;

export const shardUrl = (i) =>
  `${RAW}/catalog-shards/catalog-${String(i).padStart(2, "0")}.json`;
export const manifestUrl = `${RAW}/catalog-shard-manifest.json`;
export const shardCountUrl = `${RAW}/catalog-shards/count.json`;

// Work-locate buckets (2026-10-27): the manifest split into per-bucket
// files by scripts/build-work-locate.mjs, keyed by descShardKey. A record
// lookup fetches one small bucket instead of parsing the full ~16 MB
// manifest into a 556k-entry map (a request-path cost behind the
// 2026-10-27 /api/v1 1102s). Every possible bucket file exists (empty
// object when unused), so an unknown id reads an empty bucket.
export const locateUrl = (artifactId) =>
  `${RAW}/work-locate/${descShardKey(artifactId)}.json`;

// Description sidecar (2026-10-18 revamp): /tower-descriptions/<xx>.json,
// keyed by the LAST 2 chars of the artifact id — mirrors descShardKey in
// src/lib/catalog.js exactly.
export function descShardKey(artifactId) {
  const s = String(artifactId || "")
    .toLowerCase()
    .slice(-2)
    .replace(/[^a-z0-9]/g, "_");
  return (s + "__").slice(0, 2);
}
export const descShardUrl = (artifactId) =>
  `${RAW}/tower-descriptions/${descShardKey(artifactId)}.json`;

// Entry-record buckets (2026-11-13, residual-503 fix #2): the catalog
// records themselves, split by scripts/build-entry-records.mjs into
// small per-bucket files keyed by an FNV-1a hash of the artifact id
// (mod 46656, base36). A lookup fetches one ~60 KB bucket instead of
// the ~19 MB shard text whose transfer was the remaining
// platform-kill cost on cache misses. (Suffix keying was measured and
// rejected: numeric-suffixed ids pile into digit buckets — last-3
// chars gave a 4.3 MB largest bucket / 2.35 MB weighted mean fetch;
// the hash is uniform: max 96 KB, weighted mean 59 KB.) The bucket
// files carry only the fields the getRecordById consumers read
// (entry render, API publicFullRecord, OAI) — this layer is an
// accelerator, never the only copy of the truth, and only the shard
// path can declare an id missing. Failure contract (revised
// 2026-11-15, QUEUED-1): a bucket-layer TIMEOUT or ERROR degrades the
// lookup to { state: "error" } — the caller's established fallback
// (the entry function serves the SPA shell at 200) — instead of
// escalating into the shard path, whose ~19 MB text fetch + parse is
// exactly the cost that was killing busy isolates under crawler
// bursts (entry 500s concentrated in one crawler's burst hours while
// every other requester stayed at ~0%). Only a bucket 404 (file not
// published yet) or a record absent from a fetched bucket falls
// through to the shard path: bucket data can lag a publish, so
// absence is never treated as proof of missing. The key function
// MUST stay byte-identical to the one in
// scripts/build-entry-records.mjs.
export function entryRecordKey(artifactId) {
  const s = String(artifactId || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 46656).toString(36).padStart(3, "0");
}
export const entryRecordUrl = (artifactId) =>
  `${RAW}/entry-records/${entryRecordKey(artifactId)}.json`;

// Upstream fetches are timeout-bounded (2026-11-13, residual-503 fix
// #1): every consumer of the helpers below degrades on null — the entry
// function falls back to the SPA shell (200), sitemaps skip — but a
// HUNG fetch never returns null; it holds the invocation until the
// platform kills it (503 / error 1102) and endangers co-tenant
// requests sharing the isolate. An abort lands in the same catch ->
// null path as any other failure, so degradation works as designed.
// 3s (the browse-manifest fix 11a5aeae uses 2.5s for small JSON; the
// shard-text fetch below moves ~19 MB and gets the extra room). The
// timer covers the body read, not just the headers.
const FETCH_TIMEOUT_MS = 3000;

async function fetchBounded(url, ttlSeconds, read, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      cf: { cacheTtl: ttlSeconds, cacheEverything: true },
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    return await read(r);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Status-reporting twin of fetchBounded: same bounded fetch, but the
// caller learns WHY a fetch failed. Returns { ok: true, value } on
// success, { ok: false, reason: "http", status } for an HTTP error
// status, and { ok: false, reason: "timeout" | "error" } for an abort
// (the 3s bound firing) or any other failure (network, body parse).
// Exists for the entry-record bucket layer below, whose degradation
// contract depends on the failure class (2026-11-15, QUEUED-1).
async function fetchBoundedStatus(url, ttlSeconds, read) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      cf: { cacheTtl: ttlSeconds, cacheEverything: true },
      signal: ctl.signal,
    });
    if (!r.ok) return { ok: false, reason: "http", status: r.status };
    return { ok: true, value: await read(r) };
  } catch {
    return { ok: false, reason: ctl.signal.aborted ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }
}

// Fetch JSON through the Cloudflare edge cache. Returns null on any
// failure — callers degrade (fall back to the SPA / skip the entry) rather
// than erroring a crawler request.
//
// In-flight coalescing (2026-11-11 crawl hardening): concurrent requests
// for the same URL share ONE fetch+parse. The Nov 10 discoverability audit
// found entry pages intermittently 503ing and taking 2–8s under parallel
// crawl load while sequential samples were clean. Root cause: a parallel
// burst touching one catalog shard made every concurrent invocation fetch
// and JSON.parse the same ~19 MB shard independently — the parsed-shard
// memo below is only set after a parse completes, so it cannot absorb a
// burst — saturating isolate CPU until requests queued into timeouts.
// Sharing the promise collapses the herd to a single fetch+parse per URL
// per isolate. The entry is dropped when the promise settles, so a failed
// fetch is retried by the next caller exactly as before.
const inflightJson = new Map();

export function fetchJsonCached(url, ttlSeconds, timeoutMs) {
  // The timeout budget is part of the coalescing key: a caller that
  // can wait (batch paths) must never share a promise with one that
  // cannot (interactive paths), or the impatient caller's abort would
  // fail them both. Omitting timeoutMs keeps the FETCH_TIMEOUT_MS
  // default and the historical key shape for every existing caller.
  const key = `${ttlSeconds}:${timeoutMs || FETCH_TIMEOUT_MS}:${url}`;
  const existing = inflightJson.get(key);
  if (existing) return existing;
  const p = fetchBounded(url, ttlSeconds, (r) => r.json(), timeoutMs);
  inflightJson.set(key, p);
  const done = () => {
    if (inflightJson.get(key) === p) inflightJson.delete(key);
  };
  p.then(done, done);
  return p;
}

// fetchJsonCached's status-reporting twin (same in-flight coalescing,
// separate map because the promise carries a status object, not the
// parsed body). Used only by the entry-record bucket layer.
const inflightJsonStatus = new Map();

function fetchJsonStatus(url, ttlSeconds) {
  const key = `${ttlSeconds}:${url}`;
  const existing = inflightJsonStatus.get(key);
  if (existing) return existing;
  const p = fetchBoundedStatus(url, ttlSeconds, (r) => r.json());
  inflightJsonStatus.set(key, p);
  const done = () => {
    if (inflightJsonStatus.get(key) === p) inflightJsonStatus.delete(key);
  };
  p.then(done, done);
  return p;
}

// --- Record resolution (2026-11-11 error investigation) -------------------
// Diagnosis, measured against production the same night: the lookup path
// below used to fetch and JSON.parse a whole ~19 MB catalog shard inside
// whichever isolate received the request, then build a ~15–21k-entry Map.
// Per-isolate memos almost never hit at real traffic distribution —
// Cloudflare spreads even sequential requests across isolates — so most
// lookups paid the full cold cost (~2–4 s), and under any parallel crawl
// load the concurrent parses exceeded isolate resource limits: 503
// "error code: 1102" at ~25% of requests in a 12-way burst, ~5% at two
// concurrent streams, ~8% across ordinary pages. Two changes:
//  1. A record is extracted from the shard's raw TEXT: the needle
//     `"artifact_id": "<id>"` is located with indexOf, the enclosing flat
//     object is brace-matched (string/escape aware) and only that ~1–2 KB
//     object is JSON.parsed. No whole-shard parse, no Map build. Any
//     doubt (needle variants, exotic ids, parse mismatch) falls back to
//     the legacy full-parse path, so results are identical by construction.
//  2. Resolved records and verified-missing ids are memoized in the Cache
//     API, which is shared by every isolate at a colo: repeat lookups —
//     crawler revisits, the human-path existence check, API calls —
//     become a local cache read with no upstream fetch at all. TTL 24h
//     sits well inside the freshness contract the entry HTML layer
//     already uses (7-day edge cache). Errors are never cached.

// Coalesced text fetches (same in-flight pattern as fetchJsonCached).
const inflightText = new Map();

export function fetchTextCoalesced(url, ttlSeconds) {
  const key = `${ttlSeconds}:${url}`;
  const existing = inflightText.get(key);
  if (existing) return existing;
  const p = fetchBounded(url, ttlSeconds, (r) => r.text());
  inflightText.set(key, p);
  const done = () => {
    if (inflightText.get(key) === p) inflightText.delete(key);
  };
  p.then(done, done);
  return p;
}

// Last-shard raw-text memo (one shard's text is ~19 MB as a string — far
// lighter than its parsed object graph). The Cache API copy is written
// fire-and-forget: correctness never depends on it, it only warms the
// colo for other isolates.
let shardTextMemoIdx = -1;
let shardTextMemo = null;

const shardTextCacheKey = (i) =>
  `https://antarctic-labs.com/__shard_cache__/${i}.txt`;

export async function getShardText(i) {
  if (shardTextMemoIdx === i && shardTextMemo) return shardTextMemo;
  const cache =
    typeof caches !== "undefined" && caches.default ? caches.default : null;
  if (cache) {
    try {
      const hit = await cache.match(shardTextCacheKey(i));
      if (hit) {
        const text = await hit.text();
        if (text) {
          shardTextMemoIdx = i;
          shardTextMemo = text;
          return text;
        }
      }
    } catch {
      // Cache API trouble never fails a lookup.
    }
  }
  const text = await fetchTextCoalesced(shardUrl(i), 3600);
  if (text) {
    shardTextMemoIdx = i;
    shardTextMemo = text;
    if (cache) {
      cache
        .put(
          shardTextCacheKey(i),
          new Response(text, {
            headers: { "Cache-Control": "public, max-age=3600" },
          })
        )
        .catch(() => {});
    }
  }
  return text;
}

// Extract one flat catalog record from a shard's raw text. Returns the
// parsed record, "absent" when the id provably does not occur in the
// text, or null when extraction is not safe to trust (caller falls back
// to the full parse).
export function extractRecordFromText(text, artifactId) {
  const id = String(artifactId || "");
  if (!id || !text) return null;
  // The publish serializer writes `"artifact_id": "<id>"` (space after
  // the colon); accept the compact form too. Ids containing characters
  // JSON would escape may be stored escaped — the post-parse id check
  // and the fallback keep those correct.
  const esc = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let at = text.indexOf(`"artifact_id": "${esc}"`);
  if (at === -1) at = text.indexOf(`"artifact_id":"${esc}"`);
  if (at === -1) {
    // A plain-ASCII id needs no escaping anywhere in the file, so its
    // absence from the text is proof the record is not in this shard.
    return /^[\x20-\x7e]+$/.test(id) ? "absent" : null;
  }
  const start = text.lastIndexOf("{", at);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          const rec = JSON.parse(text.slice(start, i + 1));
          return rec && rec.artifact_id === id ? rec : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// --- Cache API record memo -------------------------------------------------
const RECORD_CACHE_TTL_SECONDS = 24 * 3600;
const recordCacheKey = (id) =>
  `https://antarctic-labs.com/__record_cache__/${encodeURIComponent(id)}`;

async function recordCacheGet(id) {
  if (typeof caches === "undefined" || !caches.default) return undefined;
  try {
    const hit = await caches.default.match(recordCacheKey(id));
    if (!hit) return undefined;
    const v = await hit.json();
    if (v && v.state === "ok" && v.record) return { state: "ok", record: v.record };
    if (v && v.state === "missing") return { state: "missing" };
    return undefined;
  } catch {
    return undefined;
  }
}

async function recordCachePut(id, value) {
  if (typeof caches === "undefined" || !caches.default) return;
  try {
    await caches.default.put(
      recordCacheKey(id),
      new Response(JSON.stringify(value), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${RECORD_CACHE_TTL_SECONDS}`,
        },
      })
    );
  } catch {
    // A failed memo write never fails the lookup it rode on.
  }
}

// Small recency-refreshing memo for parsed JSON documents that repeat
// across requests in a warm isolate (work-locate buckets, entry-record
// buckets). Bounded so a long-lived isolate cannot accumulate the whole
// catalog; least-recently-used entries evict first.
function boundedMemo(cap) {
  const map = new Map();
  return {
    get(k) {
      if (!map.has(k)) return undefined;
      const v = map.get(k);
      map.delete(k);
      map.set(k, v);
      return v;
    },
    set(k, v) {
      if (map.has(k)) map.delete(k);
      map.set(k, v);
      while (map.size > cap) map.delete(map.keys().next().value);
    },
  };
}
const locateMemo = boundedMemo(256);
const entryRecordMemo = boundedMemo(16);

// One entry-record bucket file, classified for the caller (see the
// failure contract at entryRecordKey above):
//   { kind: "ok", bucket } — fetched; an { artifact_id: record } object.
//   { kind: "lag" }        — HTTP 404: the file is not published yet.
//   { kind: "down" }       — timeout, network/HTTP error, or a body
//                            that is not a bucket object.
// Only "ok" buckets are memoized.
async function fetchEntryRecordBucket(artifactId) {
  const url = entryRecordUrl(artifactId);
  const memo = entryRecordMemo.get(url);
  if (memo !== undefined) return { kind: "ok", bucket: memo };
  const res = await fetchJsonStatus(url, 3600);
  if (!res.ok) {
    return res.reason === "http" && res.status === 404
      ? { kind: "lag" }
      : { kind: "down" };
  }
  const bucket = res.value;
  if (bucket && typeof bucket === "object" && !Array.isArray(bucket)) {
    entryRecordMemo.set(url, bucket);
    return { kind: "ok", bucket };
  }
  return { kind: "down" };
}

// artifact_id -> shard index map. ~4 MB at 133k entries, ~11 MB at 375k.
// The parsed manifest is memoized per isolate: crawlers arrive in bursts
// and sitemap-driven crawls walk entries in catalog order, so one parse
// serves many lookups. The edge fetch underneath is cached for an hour;
// when the memo ages out the refreshed manifest is picked up.
let manifestMemo = null;
let manifestMemoAt = 0;
const MANIFEST_MEMO_TTL_MS = 3600 * 1000;

export async function getShardManifest() {
  if (manifestMemo && Date.now() - manifestMemoAt < MANIFEST_MEMO_TTL_MS) {
    return manifestMemo;
  }
  const data = await fetchJsonCached(manifestUrl, 3600);
  if (data && typeof data === "object") {
    manifestMemo = data;
    manifestMemoAt = Date.now();
  }
  return data;
}

// Live catalog shard count from count.json, memoized per isolate like
// the manifest below. Only a successfully parsed count is memoized; on
// any failure the SHARD_COUNT fallback is returned for that call.
let shardCountMemo = null;
let shardCountMemoAt = 0;
const SHARD_COUNT_MEMO_TTL_MS = 3600 * 1000;

export async function getShardCount() {
  if (shardCountMemo && Date.now() - shardCountMemoAt < SHARD_COUNT_MEMO_TTL_MS) {
    return shardCountMemo;
  }
  const data = await fetchJsonCached(shardCountUrl, 300);
  const n = data && data.catalog_shards;
  if (Number.isInteger(n) && n >= 1 && n <= 1000) {
    shardCountMemo = n;
    shardCountMemoAt = Date.now();
    return n;
  }
  return SHARD_COUNT;
}

// One catalog shard as a parsed array of records (catalog order).
// Last-shard memo: entry lookups cluster by shard (catalog-order crawls),
// so caching the most recent shard's parse removes nearly all repeat
// parses without holding the whole catalog in the isolate. Alongside the
// records we keep an artifact_id -> record Map for the memoized shard, so
// lookups against it are O(1) instead of a linear scan over ~15–21k
// records on every request.
let shardMemoIdx = -1;
let shardMemoRecords = null;
let shardMemoIndex = null;

export async function getShardRecords(i, timeoutMs) {
  if (shardMemoIdx === i && shardMemoRecords) return shardMemoRecords;
  const data = await fetchJsonCached(shardUrl(i), 3600, timeoutMs);
  const records = Array.isArray(data) ? data : null;
  if (records) {
    shardMemoIdx = i;
    shardMemoRecords = records;
    shardMemoIndex = new Map();
    for (const r of records) {
      if (r && r.artifact_id && !shardMemoIndex.has(r.artifact_id)) {
        shardMemoIndex.set(r.artifact_id, r);
      }
    }
  }
  return records;
}

export async function getRecordById(artifactId) {
  artifactId = String(artifactId || "");
  if (!artifactId) return { state: "missing" };
  // Layer 1: the colo-shared record memo (see the diagnosis note above).
  const cached = await recordCacheGet(artifactId);
  if (cached !== undefined) return cached;
  // Layer 1.5 (2026-11-13 fix #2): the per-bucket record file. On a hit
  // this is the whole lookup — no work-locate fetch, no shard text.
  // Failure classes (2026-11-15, QUEUED-1): a bucket-layer timeout or
  // error degrades to { state: "error" } — the caller's shell-200
  // fallback — and NEVER escalates into the shard path below: a bucket
  // fetch only times out when the isolate/upstream is already
  // saturated, which is precisely when the ~19 MB shard fetch + parse
  // turns a slow lookup into a platform 500. A bucket 404 or a record
  // absent from a fetched bucket still falls through: bucket data can
  // lag a publish, so absence here is never proof of missing.
  const bucketRes = await fetchEntryRecordBucket(artifactId);
  if (bucketRes.kind === "down") return { state: "error" };
  if (bucketRes.kind === "ok") {
    const rec = bucketRes.bucket[artifactId];
    if (rec && typeof rec === "object" && rec.artifact_id === artifactId) {
      await recordCachePut(artifactId, { state: "ok", record: rec });
      return { state: "ok", record: rec };
    }
  }
  // Work-locate buckets are tiny and repeat constantly during a crawl;
  // memoize the parsed bucket per isolate (bounded, see boundedMemo).
  const url = locateUrl(artifactId);
  let bucket = locateMemo.get(url);
  if (bucket === undefined) {
    bucket = await fetchJsonCached(url, 3600);
    if (bucket && typeof bucket === "object") locateMemo.set(url, bucket);
  }
  if (!bucket || typeof bucket !== "object") return { state: "error" };
  const shardIdx = bucket[artifactId];
  if (shardIdx === undefined) {
    await recordCachePut(artifactId, { state: "missing" });
    return { state: "missing" };
  }
  // Layer 2: this isolate already holds the parsed shard — the Map
  // lookup is free and exact.
  if (shardMemoIdx === shardIdx && shardMemoIndex) {
    const record = shardMemoIndex.get(artifactId);
    if (record) {
      await recordCachePut(artifactId, { state: "ok", record });
      return { state: "ok", record };
    }
    await recordCachePut(artifactId, { state: "missing" });
    return { state: "missing" };
  }
  // Layer 3: extract the record from the shard's raw text — no
  // whole-shard parse (the 1102 fix).
  const text = await getShardText(shardIdx);
  if (text) {
    const extracted = extractRecordFromText(text, artifactId);
    if (extracted === "absent") {
      await recordCachePut(artifactId, { state: "missing" });
      return { state: "missing" };
    }
    if (extracted) {
      await recordCachePut(artifactId, { state: "ok", record: extracted });
      return { state: "ok", record: extracted };
    }
    // Extraction not trustworthy for this id — fall through to the
    // legacy full parse below.
  }
  // Layer 4 (legacy fallback): fetch and parse the whole shard.
  const records = await getShardRecords(shardIdx);
  if (!records) return { state: "error" };
  const record =
    shardMemoIdx === shardIdx && shardMemoIndex
      ? shardMemoIndex.get(artifactId)
      : records.find((r) => r && r.artifact_id === artifactId);
  if (record) {
    await recordCachePut(artifactId, { state: "ok", record });
    return { state: "ok", record };
  }
  await recordCachePut(artifactId, { state: "missing" });
  return { state: "missing" };
}

// Extract one entry's description string from a description shard's raw
// text, without parsing the shard. The shard is a flat { id: string }
// object; the entry's string literal is located by its key and parsed on
// its own (escape aware), so the result is byte-identical to reading the
// value out of the fully parsed shard. Returns the string, null when the
// id provably does not occur in the text, or undefined when extraction is
// not safe to trust (the caller then falls back to a full parse).
function extractDescriptionFromText(text, artifactId) {
  const id = String(artifactId || "");
  if (!id || !text) return undefined;
  // Ids containing characters JSON would escape may be stored escaped —
  // mirror extractRecordFromText's escaping; the parse fallback and the
  // absent-check below keep those ids correct.
  const esc = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const needle = `"${esc}"`;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) {
      // A plain-ASCII id needs no escaping anywhere in the file, so its
      // absence from the text is proof it is not in this shard.
      return /^[\x20-\x7e]+$/.test(id) ? null : undefined;
    }
    // A key's opening quote directly follows "{" or "," (modulo
    // whitespace). An occurrence inside a string value is preceded by
    // its escape backslash instead, so this check cannot mistake an id
    // mentioned inside another entry's description for the entry's key.
    let p = at - 1;
    while (
      p >= 0 &&
      (text[p] === " " || text[p] === "\t" || text[p] === "\n" || text[p] === "\r")
    )
      p--;
    if (p >= 0 && (text[p] === "{" || text[p] === ",")) {
      let i = at + needle.length;
      while (text[i] === " ") i++;
      if (text[i] !== ":") return undefined;
      i++;
      while (text[i] === " ") i++;
      if (text[i] !== '"') return undefined; // Non-string value: parse decides.
      let j = i + 1;
      let escaped = false;
      for (; j < text.length; j++) {
        const c = text[j];
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') break;
      }
      if (j >= text.length) return undefined;
      try {
        const v = JSON.parse(text.slice(i, j + 1));
        return typeof v === "string" ? v : undefined;
      } catch {
        return undefined;
      }
    }
    from = at + 1;
  }
}

// The v2 (rewritten) description for an entry, if the sidecar has one.
// Falls back to null; callers then use the catalog record's description.
// Description shards are keyed by the id's last 2 chars, so a crawl that
// walks the catalog in order touches every shard within its first
// minutes at a colo. This lookup therefore NEVER retains a parsed shard:
// the previous flow memoized up to 8 parsed shards per isolate
// (~3.5–3.8 MB of JSON text each, several times that as a parsed graph —
// plausibly at or over the 128 MB isolate limit), and sustained
// single-colo crawl traffic kept all 8 slots hot while entry requests
// failed at 16–21% (diagnosis 2026-11-15:
// research_notes/claudebot-diagnosis-20261115). Instead the shard is
// fetched as TEXT through the same coalesced, edge-cached fetch the
// catalog shards use (the edge cache absorbs the upstream read; the
// text itself is transient) and the one entry's string is extracted
// from it. The full parse survives only as a per-call fallback for ids
// extraction cannot trust, and its result is never retained.
export async function getDescriptionOverride(artifactId) {
  const text = await fetchTextCoalesced(descShardUrl(artifactId), 3600);
  if (!text) return null;
  let d = extractDescriptionFromText(text, artifactId);
  if (d === undefined) {
    let shard = null;
    try {
      shard = JSON.parse(text);
    } catch {
      shard = null;
    }
    if (!shard || typeof shard !== "object") return null;
    d = shard[artifactId];
  }
  return typeof d === "string" && d.trim() ? d : null;
}

// The catalog bootstrap: the first 20,000 catalog records in compact form
// (the same prefix the SPA preloads). Memoized as a promise per isolate —
// one fetch+parse serves every caller. Used by the collection landing
// pages as their first sampling source for real entry links.
export const bootstrapUrl = `${RAW}/catalog-bootstrap.json`;
let bootstrapMemo = null;

export function getBootstrapRecords() {
  if (!bootstrapMemo) {
    bootstrapMemo = (async () => {
      const data = await fetchJsonCached(bootstrapUrl, 3600);
      return Array.isArray(data) ? data : null;
    })();
  }
  return bootstrapMemo;
}

// --- Crawler detection -----------------------------------------------------
// Search/AI crawlers that do not execute the SPA's JavaScript (or render
// it late/unreliably) get the server-rendered record page. Anything else —
// every real browser — passes straight through to the SPA untouched.
// Keep this list aligned with the explicit allows in public/robots.txt.
const BOT_UA =
  /(googlebot|google-inspectiontool|adsbot|mediapartners-google|bingbot|msnbot|oai-searchbot|gptbot|chatgpt-user|claudebot|claude-searchbot|claude-user|anthropic-ai|perplexitybot|perplexity-user|meta-externalagent|meta-webindexer|facebookexternalhit|ccbot|applebot|bravebot|duckduckbot|yandexbot|slurp|ia_archiver|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|petalbot|bytespider|amazonbot|mistralai-user|cohere-ai|youbot)/i;

export function isCrawler(request) {
  const ua = request.headers.get("user-agent") || "";
  return BOT_UA.test(ua);
}

// --- HTML helpers ----------------------------------------------------------
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Absolute URL for a record's text file, or null when the record carries
// no download_url. Guardrail: download_status is not treated as proof of
// anything here — we only ever link the URL the record itself carries.
export function textFileUrl(record) {
  const u = record && record.download_url;
  if (typeof u !== "string" || !u) return null;
  return u.startsWith("http") ? u : SITE + (u.startsWith("/") ? u : "/" + u);
}

export function entryPath(artifactId) {
  return `/tower-of-babel/library/${artifactId}`;
}

export function entryUrl(artifactId) {
  return SITE + entryPath(artifactId);
}
