// Tower of Babel — lazy artifact catalog.
//
// Three-tier loading:
// - `catalog-bootstrap.json` (first 200 records) loads INSTANTLY.
//   The list renders immediately, no spinner.
// - The full index (all records, compact projection) loads as versioned
//   chunks via /catalog-index2/ (Stage 2), parsed in a Web Worker and
//   published progressively; /catalog-index.json remains as the legacy
//   fallback. Search/filter upgrade as chunks arrive.
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

// Full index: every record (compact projection). Stage 2 (2026-10-23):
// the index loads as versioned chunks (see functions/catalog-index2/),
// fetched and JSON-parsed in a Web Worker, and is PUBLISHED PROGRESSIVELY
// — listeners receive (records, complete) as each contiguous chunk run
// lands, with complete=true on the final chunk. If the v2 path is
// unavailable (manifest unreachable or malformed, or the worker fails
// before any chunk lands), the loader falls back to the legacy
// single-file /catalog-index.json fetch.
let indexComplete = false;

function publishIndex(data, complete) {
  indexCache = data;
  if (complete) indexComplete = true;
  indexReadyListeners.forEach((cb) => {
    try { cb(data, complete); } catch {}
  });
}

function fetchJsonWithRetry(url) {
  return fetchJsonOnce(url).catch(() => fetchJsonOnce(url));
}

function loadLegacyIndex() {
  return fetchJsonWithRetry("/catalog-index.json").then((data) => {
    publishIndex(data, true);
    return data;
  });
}

// Stream chunks through the worker. Resolves true if the worker failed
// (unavailable, crashed, or a chunk failed twice inside it), false when
// every chunk was delivered.
function streamChunksViaWorker(version, chunks, onChunk) {
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL("./index-worker.js", import.meta.url), {
        type: "module",
      });
    } catch {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (failed) => {
      if (settled) return;
      settled = true;
      try { worker.terminate(); } catch {}
      resolve(failed);
    };
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "chunk") onChunk(m.index, m.records);
      else if (m.type === "done") finish(false);
      else if (m.type === "error") finish(true);
    };
    worker.onerror = () => finish(true);
    try {
      worker.postMessage({ version, chunks });
    } catch {
      finish(true);
    }
  });
}

async function loadIndexV2() {
  let manifest;
  try {
    manifest = await fetchJsonWithRetry("/catalog-index2/manifest.json");
  } catch {
    return loadLegacyIndex();
  }
  const version = manifest && manifest.v;
  const chunks = manifest && manifest.chunks;
  if (!version || !Number.isInteger(chunks) || chunks < 1) {
    return loadLegacyIndex();
  }
  // Chunks arrive in any order; only the contiguous prefix is published,
  // so subscribers always see a valid catalog-order prefix.
  const parts = new Array(chunks).fill(null);
  let published = 0;
  let acc = [];
  const publishContiguous = () => {
    while (published < chunks && parts[published]) {
      acc = acc.concat(parts[published]);
      parts[published] = undefined;
      published++;
      publishIndex(acc, published === chunks);
    }
  };
  const workerFailed = await streamChunksViaWorker(version, chunks, (i, records) => {
    parts[i] = records;
    publishContiguous();
  });
  // The worker delivered nothing and failed — prefer the legacy monolith
  // (one edge-cached stream) over ten main-thread chunk parses.
  if (workerFailed && published === 0) return loadLegacyIndex();
  // Fill any gaps on the main thread (worker died midway).
  for (let i = 0; i < chunks; i++) {
    if (i >= published && !parts[i]) {
      parts[i] = await fetchJsonWithRetry(
        `/catalog-index2/${version}/${i}.json`
      );
      publishContiguous();
    }
  }
  if (!indexComplete) publishIndex(acc, true);
  return acc;
}

export function loadCatalog() {
  if (indexComplete && indexCache) return Promise.resolve(indexCache);
  if (!indexPending) {
    indexPending = loadIndexV2().then(
      (data) => {
        indexPending = null;
        return data;
      },
      (err) => {
        indexPending = null;
        throw err;
      }
    );
  }
  return indexPending;
}

// Deferred index loading (Stage 1 ungating, 2026-10-23): the full index
// is heavy — a multi-MB download, a main-thread JSON.parse, and a full
// derivation pass — so the Tower page no longer starts it automatically
// at load. The bootstrap paints the page completely; the index starts
// only on visitor intent (search focus/typing, any browse control,
// scrolling toward the results) via requestCatalogIndex(), or on the
// idle schedule armed by scheduleCatalogIndex(). loadCatalog() itself
// is unchanged and idempotent, so requesting is always safe.
let indexIdleTimer = null;
export function requestCatalogIndex() {
  if (indexIdleTimer) {
    clearTimeout(indexIdleTimer);
    indexIdleTimer = null;
  }
  return loadCatalog().catch(() => {});
}
export function scheduleCatalogIndex(delayMs = 12000) {
  if (indexCache || indexPending || indexIdleTimer) return;
  indexIdleTimer = setTimeout(() => {
    indexIdleTimer = null;
    loadCatalog().catch(() => {});
  }, delayMs);
}
// True only while the index fetch is actually in flight (the deferred
// state before any request is NOT "loading" — the status line in the
// library UI keys off this so it never claims a load that isn't running).
export function isIndexInFlight() {
  return indexPending !== null;
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

// Subscribe to index readiness. The callback receives (records,
// complete): Stage 2 publishes progressively, so it fires once per
// chunk run with complete=false and a final time with complete=true.
// Returns unsubscribe.
export function onIndexReady(cb) {
  if (indexCache) {
    // Something is already cached (partial or complete) — call
    // immediately (async to keep consistent), then keep listening for
    // further publishes unless the index is already complete.
    Promise.resolve().then(() => cb(indexCache, indexComplete));
    if (indexComplete) return () => {};
  }
  indexReadyListeners.add(cb);
  return () => { indexReadyListeners.delete(cb); };
}

// True until the full index has completely arrived (Stage 2: a partial
// progressive cache still counts as loading).
export function isIndexLoading() {
  return !indexComplete;
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
// Acquired cover images (2026-10-22 cover acquisition pipeline).
// Sidecar sharded exactly like the descriptions sidecar (LAST 2 chars of
// the artifact id): /tower-covers/<xx>.json, each a {artifact_id: url}
// map of covers verified over HTTP by the resolver — a stored URL is a
// real cover that served an image when checked. Loaded lazily per shard
// and cached; a failed shard resolves {} and callers fall back to the
// client-side derivation chain.
const coverShardCache = {};
const coverShardPending = {};
export function getCover(artifactId) {
  const key = descShardKey(artifactId);
  if (coverShardCache[key]) {
    return Promise.resolve(coverShardCache[key][artifactId] || null);
  }
  if (!coverShardPending[key]) {
    coverShardPending[key] = fetchJsonOnce(`/tower-covers/${key}.json`)
      .then(
        (data) => {
          coverShardCache[key] = data || {};
          coverShardPending[key] = null;
          return coverShardCache[key];
        },
        () => {
          coverShardCache[key] = {};
          coverShardPending[key] = null;
          return coverShardCache[key];
        }
      );
  }
  return coverShardPending[key].then((shard) => shard[artifactId] || null);
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
