// Tower of Babel — lazy artifact catalog.
//
// Three-tier loading:
// - `catalog-bootstrap.json` (first 200 records) loads INSTANTLY.
//   The list renders immediately, no spinner.
// - `catalog-index.json` (all records, compact projection) loads in the
//   BACKGROUND. Search/filter upgrade to the full catalog when it arrives.
// - `catalog.json` (full records) loads ON DEMAND for detail pages.
//
// This keeps the page paint fast even on a slow connection: the shell and
// first rows appear from the bootstrap while the full index streams in
// behind them.
//
// Failure semantics: every tier fetches with a 30s abort timeout and one
// automatic retry. A failed fetch leaves the module cache untouched (pending
// is reset, cache stays null), so re-calling the loader is always a fresh
// attempt — fetch failures are not cached anywhere. Callers surface an
// error UI with an in-place retry; the one-shot page-reload path for a
// poisoned deploy lives in main.jsx (SHELL-owned).
let bootstrapCache = null;
let indexCache = null;
let fullCache = null;
let bootstrapPending = null;
let indexPending = null;
let fullPending = null;
// Listeners for when the full index arrives (to upgrade the UI).
const indexReadyListeners = new Set();

const FETCH_TIMEOUT_MS = 30000;

function fetchJsonOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { signal: ctrl.signal })
    .then((r) => {
      if (!r.ok) throw new Error(`fetch failed: ${url} ${r.status}`);
      return r.json();
    })
    .finally(() => clearTimeout(timer));
}

function loadWithRetry(url, getPending, setPending, getCache, setCache, onReady) {
  if (getCache()) return Promise.resolve(getCache());
  if (!getPending()) {
    setPending(
      fetchJsonOnce(url)
        .catch(() => fetchJsonOnce(url))
        .then(
          (data) => {
            setCache(data);
            setPending(null);
            if (onReady) onReady(data);
            return data;
          },
          (err) => {
            setPending(null);
            throw err;
          }
        )
    );
  }
  return getPending();
}

// Bootstrap: first 200 records, loads instantly.
export function loadBootstrap() {
  return loadWithRetry(
    "/catalog-bootstrap.json",
    () => bootstrapPending,
    (p) => { bootstrapPending = p; },
    () => bootstrapCache,
    (d) => { bootstrapCache = d; }
  );
}

// Full index: every record (compact projection), loads in background.
export function loadCatalog() {
  return loadWithRetry(
    "/catalog-index.json",
    () => indexPending,
    (p) => { indexPending = p; },
    () => indexCache,
    (d) => { indexCache = d; },
    (data) => {
      // Notify listeners that the full index is ready.
      indexReadyListeners.forEach((cb) => { try { cb(data); } catch {} });
    }
  );
}

// Full records for detail pages — loaded on demand.
export function loadFullCatalog() {
  return loadWithRetry(
    "/catalog.json",
    () => fullPending,
    (p) => { fullPending = p; },
    () => fullCache,
    (d) => { fullCache = d; }
  );
}

// Subscribe to full-index readiness. Returns unsubscribe.
export function onIndexReady(cb) {
  if (indexCache) {
    // Already loaded — call immediately (async to keep consistent).
    Promise.resolve().then(() => cb(indexCache));
    return () => {};
  }
  indexReadyListeners.add(cb);
  return () => { indexReadyListeners.delete(cb); };
}

// True while the full index is still loading.
export function isIndexLoading() {
  return indexCache === null;
}

// The best available data: full index if ready, bootstrap otherwise.
export function getCachedArtifacts() {
  return indexCache || bootstrapCache;
}

// True while a bootstrap fetch is in flight (initial page load).
export function isCatalogPending() {
  return bootstrapPending !== null;
}

// Find a full record by artifact_id, loading the full catalog on demand.
// Uses the sharded catalog (2026-10-18): manifest maps ID -> shard number,
// then we fetch just that shard (~9MB) instead of the whole catalog.
let shardManifest = null;
let shardManifestPending = null;
const shardCache = {};
const shardPending = {};
// LRU cap for shardCache (2026-10-18): browsing across shards could retain ~90MB.
const SHARD_CACHE_MAX = 3;
function touchShardCache(key) {
  const keys = Object.keys(shardCache);
  while (keys.length > SHARD_CACHE_MAX) {
    delete shardCache[keys.shift()];
  }
}
function loadShardManifest() {
  if (shardManifest) return Promise.resolve(shardManifest);
  if (!shardManifestPending) {
    shardManifestPending = fetchJsonOnce("/catalog-shard-manifest.json").then(
      (data) => {
        shardManifest = data || {};
        shardManifestPending = null;
        return shardManifest;
      },
      () => {
        shardManifest = {};
        shardManifestPending = null;
        return shardManifest;
      }
    );
  }
  return shardManifestPending;
}
// Warm the manifest from the library list page (2026-10-18): fire-and-forget
// so entry visits usually hit the in-memory cache instead of a 3.9MB download.
export function warmShardManifest() {
  loadShardManifest();
}
function loadCatalogShard(n) {
  const key = `shard-${n}`;
  if (shardCache[key]) return Promise.resolve(shardCache[key]);
  if (shardPending[key]) return shardPending[key];
  const url = `/catalog-shards/catalog-${String(n).padStart(2, "0")}.json`;
  // Retry once on failure (mirrors loadWithRetry semantics).
  const attempt = (retried) =>
    fetchJsonOnce(url).then(
      (data) => {
        const items = Array.isArray(data) ? data : data?.artifacts || data?.items || [];
        shardCache[key] = items;
        touchShardCache(key);
        delete shardPending[key];
        return items;
      },
      (err) => {
        if (!retried) return attempt(true);
        delete shardPending[key];
        throw err;
      }
    );
  shardPending[key] = attempt(false);
  return shardPending[key];
}
export function getFullArtifact(artifactId) {
  if (fullCache) {
    return Promise.resolve(fullCache.find((a) => a.artifact_id === artifactId) || null);
  }
  // Try the sharded catalog first (has all 133k+ entries).
  return loadShardManifest().then((manifest) => {
    const shardNum = manifest[artifactId];
    if (shardNum === undefined) {
      // Not in manifest — fall back to legacy catalog.json.
      return loadFullCatalog().then(
        (full) => full.find((a) => a.artifact_id === artifactId) || null
      );
    }
    return loadCatalogShard(shardNum).then(
      (items) => items.find((a) => a.artifact_id === artifactId) || null
    );
  });
}

// Rewritten entry descriptions (2026-10-18 description revamp).
// Sidecar sharded by artifact_id prefix: /tower-descriptions/<xx>.json,
// each a {artifact_id: description} map. Loaded lazily per entry view and
// cached per shard; a failed shard fetch resolves null (callers fall back
// to the catalog record's own description).
const descShardCache = {};
const descShardPending = {};
function descShardKey(artifactId) {
  // LAST 2 chars: id prefixes concentrate (pmc-, arxiv-, tob-) but suffixes
  // distribute evenly. Must match build_sidecar.py.
  const s = String(artifactId || "").toLowerCase().slice(-2).replace(/[^a-z0-9]/g, "_");
  return (s + "__").slice(0, 2);
}
export function getDescription(artifactId) {
  const key = descShardKey(artifactId);
  if (descShardCache[key]) {
    return Promise.resolve(descShardCache[key][artifactId] || null);
  }
  if (!descShardPending[key]) {
    descShardPending[key] = fetchJsonOnce(`/tower-descriptions/${key}.json`)
      .then(
        (data) => {
          descShardCache[key] = data || {};
          descShardPending[key] = null;
          return descShardCache[key];
        },
        () => {
          descShardCache[key] = {};
          descShardPending[key] = null;
          return descShardCache[key];
        }
      );
  }
  return descShardPending[key].then((shard) => shard[artifactId] || null);
}
