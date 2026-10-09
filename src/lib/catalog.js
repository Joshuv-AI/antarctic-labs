// Tower of Babel — lazy artifact catalog.
//
// Two-tier loading (2026-10-09 optimization):
// - The library LIST loads `catalog-index.json` (~1MB, 4,088 records with
//   only list/search/sort fields). This is 57% smaller than the full
//   catalog and is what unblocks the list view on mobile.
// - The full `catalog.json` (~2.5MB) loads ON DEMAND when a user opens a
//   specific book's detail page. It's cached by the browser after first load.
//
// Both are fetched as JSON (not JS modules): JSON.parse is lighter than
// module evaluation on iOS Safari, and a failed fetch can be retried
// (unlike a failed dynamic import, which the module map caches permanently).
let indexCache = null;
let fullCache = null;
let indexPending = null;
let fullPending = null;

// How long a single fetch may run before treated as stalled. Mobile
// connections routinely stall mid-download; without a timeout the promise
// never settles and the user is stuck on the loading state forever.
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

function loadWithRetry(url, getPending, setPending, getCache, setCache) {
  if (getCache()) return Promise.resolve(getCache());
  if (!getPending()) {
    // One silent retry: a single stalled attempt on a flaky mobile
    // connection shouldn't doom the visit. A second failure rejects, and
    // the caller shows the error state with RETRY.
    setPending(
      fetchJsonOnce(url)
        .catch(() => fetchJsonOnce(url))
        .then(
          (data) => {
            setCache(data);
            setPending(null);
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

// Lightweight index for the library list view.
export function loadCatalog() {
  return loadWithRetry(
    "/catalog-index.json",
    () => indexPending,
    (p) => { indexPending = p; },
    () => indexCache,
    (d) => { indexCache = d; }
  );
}

// Full catalog for detail pages — loaded on demand.
export function loadFullCatalog() {
  return loadWithRetry(
    "/catalog.json",
    () => fullPending,
    (p) => { fullPending = p; },
    () => fullCache,
    (d) => { fullCache = d; }
  );
}

// True while an index fetch is in flight.
export function isCatalogPending() {
  return indexPending !== null;
}

// The loaded index array, or null if it hasn't resolved yet.
export function getCachedArtifacts() {
  return indexCache;
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
