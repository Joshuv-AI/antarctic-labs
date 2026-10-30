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
// SHARD_COUNT must match the number of shard files in the repo — the same
// constant functions/catalog.json.js carries. If a future batch adds a
// shard, bump it in BOTH places in the same commit. (35 since the
// 2026-10-30 re-shard; was 25. A stale value silently drops most of the
// catalog from every consumer that loops `i < SHARD_COUNT` — diagnosed
// 2026-10-24 on the hub pages, /catalog.json, OAI and the sitemap.)

export const SITE = "https://antarctic-labs.com";
export const SHARD_COUNT = 35;

export const RAW =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public";

export const hubsIndexUrl = `${RAW}/tower-hubs-index.json`;

export const shardUrl = (i) =>
  `${RAW}/catalog-shards/catalog-${String(i).padStart(2, "0")}.json`;
export const manifestUrl = `${RAW}/catalog-shard-manifest.json`;

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
export async function fetchJsonCached(url, ttlSeconds) {
  try {
    const r = await fetch(url, {
      cf: { cacheTtl: ttlSeconds, cacheEverything: true },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
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

// One catalog shard as a parsed array of records (catalog order).
// Last-shard memo: entry lookups cluster by shard (catalog-order crawls),
// so caching the most recent shard's parse removes nearly all repeat
// parses without holding the whole catalog in the isolate.
let shardMemoIdx = -1;
let shardMemoRecords = null;

export async function getShardRecords(i) {
  if (shardMemoIdx === i && shardMemoRecords) return shardMemoRecords;
  const data = await fetchJsonCached(shardUrl(i), 3600);
  const records = Array.isArray(data) ? data : null;
  if (records) {
    shardMemoIdx = i;
    shardMemoRecords = records;
  }
  return records;
}

export async function getRecordById(artifactId) {
  const bucket = await fetchJsonCached(locateUrl(artifactId), 3600);
  if (!bucket || typeof bucket !== "object") return { state: "error" };
  const shardIdx = bucket[artifactId];
  if (shardIdx === undefined) return { state: "missing" };
  const records = await getShardRecords(shardIdx);
  if (!records) return { state: "error" };
  const record = records.find((r) => r && r.artifact_id === artifactId);
  return record ? { state: "ok", record } : { state: "missing" };
}

// The v2 (rewritten) description for an entry, if the sidecar has one.
// Falls back to null; callers then use the catalog record's description.
export async function getDescriptionOverride(artifactId) {
  const shard = await fetchJsonCached(descShardUrl(artifactId), 3600);
  if (!shard || typeof shard !== "object") return null;
  const d = shard[artifactId];
  return typeof d === "string" && d.trim() ? d : null;
}

// --- Crawler detection -----------------------------------------------------
// Search/AI crawlers that do not execute the SPA's JavaScript (or render
// it late/unreliably) get the server-rendered record page. Anything else —
// every real browser — passes straight through to the SPA untouched.
// Keep this list aligned with the explicit allows in public/robots.txt.
const BOT_UA =
  /(googlebot|google-inspectiontool|bingbot|msnbot|oai-searchbot|gptbot|chatgpt-user|claudebot|claude-searchbot|claude-user|anthropic-ai|perplexitybot|perplexity-user|meta-externalagent|meta-webindexer|facebookexternalhit|ccbot|applebot|bravebot|duckduckbot|yandexbot|slurp|ia_archiver|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|petalbot|bytespider|amazonbot|mistralai-user|cohere-ai|youbot)/i;

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
