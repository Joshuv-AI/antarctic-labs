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

export function loadCatalog() {
  if (artifactsCache) return Promise.resolve(artifactsCache);
  if (!pending) {
    pending = fetch("/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error("catalog fetch failed: " + r.status);
        return r.json();
      })
      .then(
        (data) => {
          artifactsCache = data;
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
