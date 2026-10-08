// Tower of Babel — lazy artifact catalog (JSON fetch).
//
// The catalog (3,448 records, ~2.4MB JSON) is fetched as JSON rather than
// a JavaScript module. JSON.parse is significantly lighter than JS module
// evaluation on iOS Safari: no bytecode compilation, lower peak memory,
// and the main thread stays responsive. The fetch is cached by the browser.
//
// NOTE: a failed fetch can be retried (unlike a failed dynamic import(),
// which the browser's module map caches permanently). The caller shows
// an error state with RETRY on failure.
let artifactsCache = null;
let pending = null;

// How long a single catalog fetch may run before it is treated as stalled.
// Mobile connections routinely stall mid-download; without a timeout the
// promise never settles, the library renders nothing forever, and the user
// is left on a blank page after the boot loader's failsafe lifts.
const CATALOG_TIMEOUT_MS = 30000;

function fetchCatalogOnce() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CATALOG_TIMEOUT_MS);
  return fetch("/catalog.json", { signal: ctrl.signal })
    .then((r) => {
      if (!r.ok) throw new Error("catalog fetch failed: " + r.status);
      return r.json();
    })
    .finally(() => clearTimeout(timer));
}

export function loadCatalog() {
  if (artifactsCache) return Promise.resolve(artifactsCache);
  if (!pending) {
    // One silent retry: a single stalled attempt on a flaky mobile
    // connection shouldn't doom the visit. A second failure rejects, and
    // the caller shows the error state with RETRY — the loading state
    // always resolves, never an infinite blank page.
    pending = fetchCatalogOnce()
      .catch(() => fetchCatalogOnce())
      .then(
        (data) => {
          artifactsCache = data;
          // W1 fix (2026-10-01): clear pending on success too. Otherwise
          // isCatalogPending() returns true forever after the first load,
          // and the Tower loader takes the 8s re-arm branch on every
          // later navigation instead of dismissing at 4s.
          pending = null;
          return artifactsCache;
        },
        (err) => {
          // Clear so a later call retries the fetch instead of hanging
          // on a rejected promise.
          pending = null;
          throw err;
        }
      );
  }
  return pending;
}

// True while a catalog fetch is in flight.
export function isCatalogPending() {
  return pending !== null;
}

// The loaded array, or null if it hasn't resolved yet.
export function getCachedArtifacts() {
  return artifactsCache;
}
