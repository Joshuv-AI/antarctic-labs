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

export function fetchJsonCached(url, ttlSeconds) {
  const key = `${ttlSeconds}:${url}`;
  const existing = inflightJson.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const r = await fetch(url, {
        cf: { cacheTtl: ttlSeconds, cacheEverything: true },
      });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  })();
  inflightJson.set(key, p);
  const done = () => {
    if (inflightJson.get(key) === p) inflightJson.delete(key);
  };
  p.then(done, done);
  return p;
}

// Small recency-refreshing memo for parsed JSON documents that repeat
// across requests in a warm isolate (work-locate buckets, description
// shards, the catalog bootstrap). Bounded so a long-lived isolate cannot
// accumulate the whole catalog; least-recently-used entries evict first.
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
const descMemo = boundedMemo(8);

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

export async function getShardRecords(i) {
  if (shardMemoIdx === i && shardMemoRecords) return shardMemoRecords;
  const data = await fetchJsonCached(shardUrl(i), 3600);
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
  if (shardIdx === undefined) return { state: "missing" };
  const records = await getShardRecords(shardIdx);
  if (!records) return { state: "error" };
  const record =
    shardMemoIdx === shardIdx && shardMemoIndex
      ? shardMemoIndex.get(artifactId)
      : records.find((r) => r && r.artifact_id === artifactId);
  return record ? { state: "ok", record } : { state: "missing" };
}

// The v2 (rewritten) description for an entry, if the sidecar has one.
// Falls back to null; callers then use the catalog record's description.
// Description shards are keyed by the id's last 2 chars, so the same few
// files serve most lookups in a crawl burst; memoize the parsed shard per
// isolate instead of re-fetching and re-parsing it on every entry render.
export async function getDescriptionOverride(artifactId) {
  const url = descShardUrl(artifactId);
  let shard = descMemo.get(url);
  if (shard === undefined) {
    shard = await fetchJsonCached(url, 3600);
    if (shard && typeof shard === "object") descMemo.set(url, shard);
  }
  if (!shard || typeof shard !== "object") return null;
  const d = shard[artifactId];
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
