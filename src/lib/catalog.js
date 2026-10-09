// Tower of Babel — lazy artifact catalog.
//
// Three-tier loading (2026-10-09 optimization):
// - `catalog-bootstrap.json` (~43KB, first 200 records) loads INSTANTLY.
//   The list renders immediately, no spinner.
// - `catalog-index.json` (~1MB, all 4,088 records) loads in the BACKGROUND.
//   Search/filter upgrade to full catalog when it arrives.
// - `catalog.json` (~2.5MB, full records) loads ON DEMAND for detail pages.
//
// This solves the "stuck on loading" issue: the page paints in <1s even on
// a slow connection, and the full catalog streams in behind it.
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

// Full index: all 4,088 records, loads in background.
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
export function getFullArtifact(artifactId) {
  if (fullCache) {
    return Promise.resolve(fullCache.find((a) => a.artifact_id === artifactId) || null);
  }
  return loadFullCatalog().then(
    (full) => full.find((a) => a.artifact_id === artifactId) || null
  );
}
