// Serves /catalog-index2/manifest.json — the version + chunk map for the
// Stage 2 library index (2026-10-23). The browser fetches this tiny
// document first, then pulls the index as versioned chunks
// (/catalog-index2/<version>/<i>.json, one per repo index shard) that are
// parsed in a Web Worker and published progressively. Versioned chunk
// URLs carry immutable caching, so repeat visits reuse the HTTP cache
// instead of re-downloading the whole catalog index.
//
// The version is a hash of the index shards' current validators (ETag /
// Content-Length) on main. Any data push that changes a shard changes
// the version — and therefore every chunk URL — while unchanged data
// keeps one version and one cache fill. Data source is the same
// raw.githubusercontent main-branch read the other catalog functions
// use, so [CF-Pages-Skip] data pushes are reflected without a rebuild.
//
// SHARD_COUNT must match the number of catalog-index shards in the repo
// (the Tower pipeline ships the index as 25 shards since the 2026-10-27
// re-shard at 600,320 entries — the Pages 25 MiB per-file cap forced the
// split finer; merge_catalog_v2.py divmod split). Keep in sync with functions/catalog-index.json.js and
// functions/catalog-index2/[version]/[index].js.

const SHARD_COUNT = 25;
const RAW =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public/catalog-index-shards";
const shardUrl = (i) =>
  `${RAW}/catalog-index-${String(i).padStart(2, "0")}.json`;

// Per-isolate memo: crawlers and visitors arrive in bursts; one version
// computation serves them all for a few minutes (the same TTL the edge
// cache underneath uses).
let memo = null;
let memoAt = 0;
const MEMO_TTL_MS = 300 * 1000;

async function computeVersion() {
  const parts = await Promise.all(
    Array.from({ length: SHARD_COUNT }, async (_, i) => {
      try {
        const r = await fetch(shardUrl(i), {
          method: "HEAD",
          cf: { cacheTtl: 300, cacheEverything: true },
        });
        if (!r.ok) return "missing";
        return (
          r.headers.get("etag") ||
          r.headers.get("content-length") ||
          "unknown"
        );
      } catch {
        return "error";
      }
    })
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(parts.join("|"))
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

export async function onRequest(context) {
  if (memo && Date.now() - memoAt < MEMO_TTL_MS) {
    return jsonResponse(memo);
  }
  let version;
  try {
    version = await computeVersion();
  } catch {
    // Degraded fallback: an hourly bucket keeps the loader working (and
    // chunks re-fetch at most hourly) if validators are unreachable.
    version = "t" + Math.floor(Date.now() / 3600000).toString(36);
  }
  memo = { v: version, chunks: SHARD_COUNT };
  memoAt = Date.now();
  return jsonResponse(memo);
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
